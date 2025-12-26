// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FeeVault.sol";
import "./NikaSettlement.sol";

contract SettlementChecker {
    FeeVault public immutable feeVault;
    NikaSettlement public immutable settlement;
    
    struct ProofOfFill {
        bytes32 settlementTxHash;
        address solver;
        address rewardToken;  // Token to receive as reward
        uint256 rewardAmount; // Amount to receive as reward
        uint256 blockNumber;
        uint256 timestamp;
    }
    
    // Track verified proofs
    mapping(bytes32 => bool) public verifiedProofs;
    
    // Track solver fill count
    mapping(address => uint256) public solverFillCount;
    
    event ProofVerified(
        bytes32 indexed proofHash,
        address indexed solver,
        bytes32 indexed settlementTxHash,
        uint256 rewardAmount
    );
    
    event FundsReleasedToSolver(
        address indexed solver,
        address indexed token,
        uint256 amount,
        bytes32 indexed proofHash
    );
    
    constructor(address _feeVault, address _settlement) {
        require(_feeVault != address(0), "Invalid FeeVault address");
        require(_settlement != address(0), "Invalid Settlement address");
        
        feeVault = FeeVault(_feeVault);
        settlement = NikaSettlement(_settlement);
    }
    
    /**
     * @notice Verify proof of fill and release funds from FeeVault to solver
     * @param proof The proof of fill data
     * @param proofHash The hash of the proof for verification
     */
    function verifyAndRelease(
        ProofOfFill calldata proof,
        bytes32 proofHash
    ) external {
        // Verify proof hasn't been processed
        require(!verifiedProofs[proofHash], "Proof already verified");
        
        // Verify proof hash matches the provided proof data
        bytes32 computedHash = keccak256(abi.encode(
            proof.settlementTxHash,
            proof.solver,
            proof.rewardToken,
            proof.rewardAmount,
            proof.blockNumber,
            proof.timestamp
        ));
        
        require(computedHash == proofHash, "Invalid proof hash");
        
        // Verify solver address is valid
        require(proof.solver != address(0), "Invalid solver address");
        
        // Verify reward amount is valid
        require(proof.rewardAmount > 0, "Invalid reward amount");
        
        // Mark proof as verified
        verifiedProofs[proofHash] = true;
        
        // Increment solver fill count
        solverFillCount[proof.solver]++;
        
        emit ProofVerified(
            proofHash,
            proof.solver,
            proof.settlementTxHash,
            proof.rewardAmount
        );
        
        // Release funds from FeeVault to solver
        // Note: FeeVault.releaseFunds() requires owner() to call it
        // In production, you might want to make SettlementChecker the owner of FeeVault
        // or use a different access control pattern
        feeVault.releaseFunds(
            proof.solver,
            proof.rewardToken,
            proof.rewardAmount,
            proofHash
        );
        
        emit FundsReleasedToSolver(
            proof.solver,
            proof.rewardToken,
            proof.rewardAmount,
            proofHash
        );
    }
    
    /**
     * @notice Check if a proof has been verified
     * @param proofHash The proof hash to check
     * @return True if proof has been verified
     */
    function isProofVerified(bytes32 proofHash) external view returns (bool) {
        return verifiedProofs[proofHash];
    }
}
