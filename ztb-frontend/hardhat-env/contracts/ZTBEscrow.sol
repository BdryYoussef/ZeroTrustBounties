// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ZTBEscrow
 * @author Ammar (ZTB Protocol)
 * @notice ZTB (Zero-Trust Bounties) Escrow Contract V4.3
 * @dev Handles front-running protections, ZK verification integration and dynamic settlement.
 */

// Minimal IERC20 interface for USDT settlement
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// Minimal RiscZero Verifier interface
interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
}

contract ZTBEscrow {
    /// @notice Defines the bounty execution rules logic
    enum Mode { STRICT, RELAXED }

    /// @notice Struct holding complete configuration for a single Bounty
    struct Bounty {
        string targetCID;
        bytes32 staticPropsHash;
        bytes32 baselineMerkleRootA;
        bytes32 baselineMerkleRootB;
        bytes32 baselineHashA;
        bytes32 baselineHashB;
        bytes32 financialConfigHash;
        uint256 reward;
        uint256 rewardFloor; // 70% of reward for RELAXED mode without C3
        uint256 createdAt;
        uint256 proofsOpenAt; // H+96h
        Mode mode; // STRICT or RELAXED
        address sponsor;
        bool isOpen;
    }

    struct CommitInfo {
        uint256 committedAt;
    }

    // Storage
    uint256 public bountyCounter;
    mapping(uint256 => Bounty) public bounties;
    
    // Commit logic storage (INV-9)
    mapping(bytes32 => CommitInfo) public commitments;
    // Track attempts per hunter per bounty (INV-10)
    mapping(uint256 => mapping(address => uint256)) public commitAttempts;

    // Immutables
    address public immutable usdtToken;
    address public immutable riscZeroVerifier;
    bytes32 public immutable imageId;

    // Events
    event BountyCreated(uint256 indexed bountyId, address indexed sponsor, uint256 reward, Mode mode);
    event Committed(bytes32 indexed commitHash, address indexed hunter);
    event ExploitProven(bytes32 indexed payloadHash, string encryptedPayload);
    event BountySettled(uint256 indexed bountyId, address indexed hunter, uint256 payout);

    /**
     * @notice Constructor for the ZTBEscrow Contract
     * @param _usdtToken Address of the USDT ERC20 token on the deployed network
     * @param _riscZeroVerifier Address of the Risc Zero groth16 Verifier
     * @param _imageId Risc Zero Guest image ID deployed
     */
    constructor(address _usdtToken, address _riscZeroVerifier, bytes32 _imageId) {
        usdtToken = _usdtToken;
        riscZeroVerifier = _riscZeroVerifier;
        imageId = _imageId;
    }

    /**
     * @notice Helper to create a new bounty (for completeness of escrow logic)
     */
    function createBounty(
        string memory _targetCID,
        bytes32 _staticPropsHash,
        bytes32 _baselineMerkleRootA,
        bytes32 _baselineMerkleRootB,
        bytes32 _baselineHashA,
        bytes32 _baselineHashB,
        bytes32 _financialConfigHash,
        uint256 _reward,
        Mode _mode
    ) external {
        // Escrow funds first
        require(IERC20(usdtToken).transferFrom(msg.sender, address(this), _reward), "USDT transfer failed");

        uint256 bId = bountyCounter++;
        
        bounties[bId] = Bounty({
            targetCID: _targetCID,
            staticPropsHash: _staticPropsHash,
            baselineMerkleRootA: _baselineMerkleRootA,
            baselineMerkleRootB: _baselineMerkleRootB,
            baselineHashA: _baselineHashA,
            baselineHashB: _baselineHashB,
            financialConfigHash: _financialConfigHash,
            reward: _reward,
            rewardFloor: (_reward * 70) / 100, // Fixed 70% according to spec
            createdAt: block.timestamp,
            proofsOpenAt: block.timestamp + 96 hours, // INV-time: Anti oracle-inverse invariant
            mode: _mode,
            sponsor: msg.sender,
            isOpen: true
        });

        emit BountyCreated(bId, msg.sender, _reward, _mode);
    }

    /**
     * @notice Computes the required stake for a commit to prevent DoS and Griefing (INV-10)
     * @param attempts The number of previous commit attempts by this user for the bounty
     * @param payloadLength The length of the payload in bytes
     * @return requiredStake The stake required in wei
     */
    function computeRequiredStake(uint256 attempts, uint256 payloadLength) public pure returns (uint256) {
        // Core invariant logic: 
        // 1. Base stake scaled exponentially using 2^n
        // 2. Incremental Step penalty based on payload size
        uint256 baseStake = 0.01 ether;
        uint256 exponentialPenalty = baseStake * (2 ** attempts);
        uint256 stepPenalty = (payloadLength / 100) * 0.001 ether;
        return exponentialPenalty + stepPenalty;
    }

    /**
     * @notice Commit a payload hash natively to prevent front-running (INV-9)
     * @dev Wagmi frontend uses the generated ABI for this operation.
     * @param bountyId The targeted bounty id
     * @param commitHash keccak256(abi.encodePacked(msg.sender, payloadHash, nonce))
     * @param payloadLength Number of bytes in the payload to evaluate limits
     */
    function commit(uint256 bountyId, bytes32 commitHash, uint256 payloadLength) external payable {
        require(bounties[bountyId].isOpen, "Bounty not open");
        
        uint256 attempts = commitAttempts[bountyId][msg.sender];
        uint256 requiredStake = computeRequiredStake(attempts, payloadLength);
        require(msg.value >= requiredStake, "Insufficient stake for INV-10");

        commitments[commitHash] = CommitInfo({ committedAt: block.timestamp });
        commitAttempts[bountyId][msg.sender] = attempts + 1;

        emit Committed(commitHash, msg.sender);
    }

    /**
     * @notice Submits a Zero Knowledge Proof verifying an exploitation methodology against the Guest
     * @param bountyId The ID uniquely identifying the bounty target
     * @param payloadHash Hash of the raw exploit payload used in commit
     * @param nonce The user secret nonce to confirm identity (INV-9)
     * @param groth16Receipt SNARK proof formatted specifically for Risc Zero verification wrapper
     * @param journal Encoded output from the Guest Execution environment
     * @param encryptedPayload Full payload explicitly encrypted against sponsor public key for delivery
     */
    function submitProof(
        uint256 bountyId,
        bytes32 payloadHash,
        uint256 nonce,
        bytes calldata groth16Receipt,
        bytes calldata journal,
        string calldata encryptedPayload
    ) external {
        Bounty storage b = bounties[bountyId];
        require(b.isOpen, "Bounty is closed or already settled");
        // Ensure 96h duration requirement to block immediate replay state
        require(block.timestamp >= b.proofsOpenAt, "Anti oracle-inverse: 96h");

        // Validate INV-9 Commitment Mapping
        // Prevents generalized frontrunning mempool bots since nonce must remain private until broadcast
        bytes32 commitHash = keccak256(abi.encodePacked(msg.sender, payloadHash, nonce));
        require(commitments[commitHash].committedAt > 0, "No valid commit found");
        require(commitments[commitHash].committedAt < block.timestamp, "Commit too early / same block slot");

        // Step 1: Verification against on-chain Risc Zero verifier
        bytes32 journalDigest = sha256(journal);
        IRiscZeroVerifier(riscZeroVerifier).verify(groth16Receipt, imageId, journalDigest);

        // Step 2: Decoding journal payload matching abi spec of ZTB Guest outputs
        (
            bool c1a,
            bool c1b,
            bool c2,
            bool c3,
            /* uint256 totalNew */,
            bytes32 config_hash
        ) = abi.decode(journal, (bool, bool, bool, bool, uint256, bytes32));

        // Step 3: Enforcing integrity invariants strictly
        // INV-14: Financial Config assurance between guest & smart contract memory
        require(config_hash == b.financialConfigHash, "INV-14: Invalid financial config");

        // Hard checks for layers 1 & 2
        require(c1a && c1b && c2, "Core layer validation failed (c1a, c1b, c2)");

        // Step 4: Mode Processing & Payout Calculations
        uint256 payout = 0;
        if (b.mode == Mode.STRICT) {
            require(c3 == true, "STRICT mode requires active C3 trigger");
            payout = b.reward;
        } else if (b.mode == Mode.RELAXED) {
            if (c3 == true) {
                payout = b.reward;
            } else {
                payout = b.rewardFloor;
            }
        }

        // Single transaction finalization (Atomic block closure)
        b.isOpen = false;

        // Perform settlement using ERC20 standard token mappings. Standard logic covers typical tether interaction safely check.
        bool success = IERC20(usdtToken).transfer(msg.sender, payout);
        require(success, "USDT transfer failed to Hunter");

        // Reflexive refund if reward was partially trimmed
        if (b.reward > payout) {
             bool refundSuccess = IERC20(usdtToken).transfer(b.sponsor, b.reward - payout);
             require(refundSuccess, "USDT refund failed to Sponsor");
        }

        // Emit relevant payload traces to indexers to forward securely to the Sponsor panel.
        emit ExploitProven(payloadHash, encryptedPayload);
        emit BountySettled(bountyId, msg.sender, payout);
    }
}
