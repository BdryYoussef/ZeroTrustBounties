// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ZTBEscrow
 * @author Ammar (ZTB Protocol)
 * @notice ZTB (Zero-Trust Bounties) Escrow Contract V4.3
 * @dev Handles front-running protections, ZK verification integration and dynamic settlement.
 *
 * INV-11 (96h timelock): Restored. Bypassed in dev mode (chain 31337) via isDevMode.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
}

contract ZTBEscrow {

    // ── Enums ──────────────────────────────────────────────────
    enum Domain { FINANCIAL, ACCESS_CONTROL, GENERAL }
    enum Mode   { STRICT, RELAXED }

    // ── Structs ────────────────────────────────────────────────
    struct Bounty {
        bytes32 targetCID;
        bytes32 staticPropsHash;
        bytes32 baselineMerkleRootA;
        bytes32 baselineMerkleRootB;
        bytes32 baselineAHash;
        bytes32 baselineBHash;
        bytes32 financialConfigHash;
        uint256 reward;
        uint256 rewardFloor;
        uint256 maxSteps;
        uint256 createdAt;
        uint256 proofsOpenAt;       // createdAt + 96h
        Domain  domain;
        Mode    mode;
        address sponsor;
        bytes   eciesPublicKey;
        bool    isOpen;
    }

    struct CommitInfo {
        uint256 committedAt;
    }

    // ── State ──────────────────────────────────────────────────
    uint256 public nextId;                                              // bounty counter (nextId() in ABI)
    mapping(uint256 => Bounty) public bounties;
    mapping(bytes32 => CommitInfo) public commitments;
    mapping(uint256 => mapping(address => uint256)) public commitAttempts;
    mapping(uint256 => address) public activeCommitter;
    mapping(uint256 => uint256) public commitDeadline;

    // ── Immutables ────────────────────────────────────────────
    address  public immutable usdtToken;
    address  public immutable riscZeroVerifier;
    bytes32  public immutable imageId;
    bool     public immutable isDevMode;   // true when chain.id == 31337 (Anvil)

    // ── Events ────────────────────────────────────────────────
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed sponsor,
        uint256 reward,
        uint8   domain,
        uint8   mode
    );

    event Committed(bytes32 indexed commitHash, address indexed hunter);

    event CommitCleared(
        uint256 indexed bountyId,
        address indexed slashedCommitter,
        uint256         forfeitedStake
    );

    event ExploitProven(
        uint256 indexed bountyId,
        address indexed hacker,
        bytes32         payloadHash,
        bytes           encryptedPayload,
        bool c1a, bool c1b, bool c2, bool c3,
        uint32  totalNew,
        uint256 amount
    );

    // ── Constructor ───────────────────────────────────────────
    constructor(
        address _usdtToken,
        address _riscZeroVerifier,
        bytes32 _imageId
    ) {
        usdtToken        = _usdtToken;
        riscZeroVerifier = _riscZeroVerifier;
        imageId          = _imageId;
        isDevMode        = (block.chainid == 31337);  // INV-11 bypass for Anvil
    }

    // ── createBounty ──────────────────────────────────────────
    /**
     * @notice Sponsor creates a new bug bounty and locks USDT reward.
     */
    function createBounty(
        bytes32        targetCID,
        bytes32        staticPropsHash,
        bytes32        baselineMerkleRootA,
        bytes32        baselineMerkleRootB,
        bytes32        baselineAHash,
        bytes32        baselineBHash,
        bytes32        financialConfigHash,
        uint8          domain,
        uint8          mode,
        bytes calldata extractionReceipt,      // Groth16 receipt (future: verify on-chain)
        uint256        maxSteps,
        bytes calldata eciesPublicKey,
        uint256        reward,
        uint256        rewardFloor
    ) external {
        require(reward > 0, "Reward must be > 0");
        require(
            IERC20(usdtToken).transferFrom(msg.sender, address(this), reward),
            "USDT escrow failed"
        );

        uint256 bId = nextId++;

        bounties[bId] = Bounty({
            targetCID:           targetCID,
            staticPropsHash:     staticPropsHash,
            baselineMerkleRootA: baselineMerkleRootA,
            baselineMerkleRootB: baselineMerkleRootB,
            baselineAHash:       baselineAHash,
            baselineBHash:       baselineBHash,
            financialConfigHash: financialConfigHash,
            reward:              reward,
            rewardFloor:         rewardFloor,
            maxSteps:            maxSteps,
            createdAt:           block.timestamp,
            proofsOpenAt:        0, // Set upon activation
            domain:              Domain(domain),
            mode:                Mode(mode),
            sponsor:             msg.sender,
            eciesPublicKey:      eciesPublicKey,
            isOpen:              false // PENDING 72h state
        });

        emit BountyCreated(bId, msg.sender, reward, domain, mode);
    }

    // ── activateBounty (PRIORITY 2) ──────────────────────────
    /**
     * @notice Sponsor activates bounty after the 72-hour contestation period.
     */
    function activateBounty(uint256 bountyId) external {
        Bounty storage b = bounties[bountyId];
        require(msg.sender == b.sponsor, "Only sponsor can activate");
        require(!b.isOpen, "Bounty already active or settled");
        // 72h contestation period (Bypassed if RISC0_DEV_MODE/Anvil)
        require(isDevMode || block.timestamp >= b.createdAt + 72 hours, "72h contestation active");

        b.isOpen = true;
        // INV-11: 96-hour hacking/proving timelock starts once bounty is active
        b.proofsOpenAt = block.timestamp + 96 hours;
    }

    // ── computeRequiredStake ──────────────────────────────────
    function computeRequiredStake(
        address hacker,
        uint256 bountyId,
        uint256 payloadLength
    ) public view returns (uint256) {
        uint256 attempts      = commitAttempts[bountyId][hacker];
        uint256 baseStake     = 0.1 ether * (2 ** (attempts < 5 ? attempts : 5));
        uint256 stepPenalty   = (payloadLength / 100) * 0.001 ether;
        return baseStake + stepPenalty;
    }

    // ── commit ────────────────────────────────────────────────
    /**
     * @notice Hacker posts a commitment hash (INV-9 anti-frontrunning).
     */
    function commit(
        uint256 bountyId,
        bytes32 commitHash,
        uint256 payloadLength
    ) external payable {
        Bounty storage b = bounties[bountyId];
        require(b.isOpen, "Bounty not open");

        uint256 requiredStake = computeRequiredStake(msg.sender, bountyId, payloadLength);
        require(msg.value >= requiredStake, "Insufficient stake (INV-10)");

        commitments[commitHash]               = CommitInfo({ committedAt: block.timestamp });
        commitAttempts[bountyId][msg.sender]  = commitAttempts[bountyId][msg.sender] + 1;
        activeCommitter[bountyId]             = msg.sender;
        commitDeadline[bountyId]              = block.timestamp + 72 hours;

        emit Committed(commitHash, msg.sender);
    }

    // ── submitProof ───────────────────────────────────────────
    /**
     * @notice Hacker submits a RISC Zero ZK proof and encrypted exploit payload.
     *
     * INV-11: 96h timelock is bypassed in dev mode (chain 31337 at deploy time).
     */
    function submitProof(
        uint256        bountyId,
        bytes32        payloadHash,
        uint256        nonce,
        bytes calldata groth16Receipt,
        bytes calldata journal,
        string calldata encryptedPayload
    ) external {
        Bounty storage b = bounties[bountyId];
        require(b.isOpen, "Bounty closed or settled");

        // INV-11: 96h anti-oracle-inverse timelock
        // isDevMode is set immutably at deploy time when chain.id == 31337
        require(
            isDevMode || block.timestamp >= b.proofsOpenAt,
            "Anti oracle-inverse: 96h"
        );

        // INV-9: Validate commitment
        bytes32 commitHash = keccak256(abi.encodePacked(msg.sender, payloadHash, nonce));
        require(commitments[commitHash].committedAt > 0,               "No valid commit");
        require(commitments[commitHash].committedAt < block.timestamp, "Same-block replay");

        // Step 1: ZK proof verification
        bytes32 journalDigest = sha256(journal);
        IRiscZeroVerifier(riscZeroVerifier).verify(groth16Receipt, imageId, journalDigest);

        // Step 2: Decode 6 key fields from the 15-field guest journal
        (
            bool c1a,
            bool c1b,
            bool c2,
            bool c3,
            uint32 totalNew,
            bytes32 config_hash
        ) = abi.decode(journal, (bool, bool, bool, bool, uint32, bytes32));

        // INV-14: Financial config integrity
        require(config_hash == b.financialConfigHash, "INV-14: config hash mismatch");

        // Core conditions: at least C1a or C2 must be true
        require(c1a || c2, "No exploit vector proven (C1a or C2 required)");

        // Step 3: Payout
        uint256 payout;
        if (b.mode == Mode.STRICT) {
            require(c3, "STRICT mode: C3 novelty required");
            payout = b.reward;
        } else {
            payout = c3 ? b.reward : b.rewardFloor;
        }

        // Atomic closure
        b.isOpen = false;

        bool ok = IERC20(usdtToken).transfer(msg.sender, payout);
        require(ok, "USDT transfer failed");

        if (b.reward > payout) {
            bool refund = IERC20(usdtToken).transfer(b.sponsor, b.reward - payout);
            require(refund, "USDT refund to sponsor failed");
        }

        emit ExploitProven(
            bountyId, msg.sender, payloadHash,
            bytes(encryptedPayload),
            c1a, c1b, c2, c3, totalNew, payout
        );
    }

    // ── cancelBounty ──────────────────────────────────────────
    /**
     * @notice Sponsor cancels a bounty and withdraws the locked USDT.
     * Allowed only if no unexpired commit locks are held by hackers.
     */
    function cancelBounty(uint256 bountyId) external {
        Bounty storage b = bounties[bountyId];
        require(b.isOpen, "Bounty already closed or settled");
        require(msg.sender == b.sponsor, "Only sponsor can cancel");

        // Ensure no active hacker has a valid commit lock pending
        if (activeCommitter[bountyId] != address(0)) {
            require(block.timestamp > commitDeadline[bountyId], "Hacker commit lock active");
        }

        b.isOpen = false;
        
        bool ok = IERC20(usdtToken).transfer(b.sponsor, b.reward);
        require(ok, "USDT refund failed");
    }

    // ── clearExpiredCommit (ANTI-GRIEFING) ────────────────────
    /**
     * @notice Anyone can call this to clear a stale commit after its 72h deadline.
     *         The forfeited ETH stake is transferred to the bounty sponsor.
     *         This prevents a hacker from "hostage-locking" a slot indefinitely.
     */
    function clearExpiredCommit(uint256 bountyId) external {
        require(
            block.timestamp > commitDeadline[bountyId],
            "Commit not expired"
        );
        address griefer = activeCommitter[bountyId];
        require(griefer != address(0), "No active committer");

        // Capture the forfeited stake (the full ETH balance that was staked)
        // We use the commit deadline as a proxy — bounty's staked amount was sent by griefer
        uint256 forfeit = address(this).balance; // Full ETH held by contract belongs to pending stakes

        // Clear slot state
        activeCommitter[bountyId] = address(0);
        commitDeadline[bountyId]  = 0;

        // Slash: send forfeited ETH to sponsor as compensation
        Bounty storage b = bounties[bountyId];
        if (forfeit > 0) {
            (bool sent,) = payable(b.sponsor).call{value: forfeit}("");
            require(sent, "ETH slash transfer failed");
        }

        emit CommitCleared(bountyId, griefer, forfeit);
    }
}
