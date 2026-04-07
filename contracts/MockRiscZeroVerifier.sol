// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockRiscZeroVerifier
 * @notice Permissive stub for IRiscZeroVerifier used during local Anvil demo.
 *         In RISC0_DEV_MODE=1, proofs are fake; this verifier never reverts
 *         so the full ZTBEscrow flow can be exercised end-to-end.
 *
 * IMPORTANT: NEVER deploy this on a public network.
 */
contract MockRiscZeroVerifier {
    /**
     * @notice Always succeeds — validates any seal/imageId/digest triple.
     */
    function verify(
        bytes calldata /* seal */,
        bytes32       /* imageId */,
        bytes32       /* journalDigest */
    ) external pure {
        // No-op: permissive for dev/demo mode
    }
}
