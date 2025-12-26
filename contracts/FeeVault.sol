// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FeeVault is Ownable {
    // Mapping to track solver rewards (accumulated fees that will be paid out)
    mapping(address => uint256) public solverRewards;
    
    // Track processed proofs to prevent double-spending
    mapping(bytes32 => bool) public processedProofs;
    
    // Track total deposits per token
    mapping(address => uint256) public totalDeposits;
    
    event FundsDeposited(address indexed token, uint256 amount, address indexed depositor);
    event FundsReleased(address indexed solver, address indexed token, uint256 amount, bytes32 indexed proofHash);
    event SolverRewardAdded(address indexed solver, uint256 amount);
    event ProofProcessed(bytes32 indexed proofHash);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Deposit fees into the vault
     * @param token The token address to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");
        
        totalDeposits[token] += amount;
        emit FundsDeposited(token, amount, msg.sender);
    }
    
    /**
     * @notice Add reward to a solver's account (called by owner/admin)
     * @param solver The solver address
     * @param amount The reward amount to add
     */
    function addSolverReward(address solver, uint256 amount) external onlyOwner {
        require(solver != address(0), "Invalid solver address");
        require(amount > 0, "Amount must be greater than 0");
        
        solverRewards[solver] += amount;
        emit SolverRewardAdded(solver, amount);
    }
    
    /**
     * @notice Release funds to solver after proof verification
     * @param solver The solver address to receive funds
     * @param token The token address to release
     * @param amount The amount to release
     * @param proofHash The proof hash to prevent double-spending
     */
    function releaseFunds(
        address solver,
        address token,
        uint256 amount,
        bytes32 proofHash
    ) external {
        require(msg.sender == owner(), "Only owner can release funds");
        require(!processedProofs[proofHash], "Proof already processed");
        require(solverRewards[solver] >= amount, "Insufficient solver rewards");
        require(amount > 0, "Amount must be greater than 0");
        
        // Mark proof as processed
        processedProofs[proofHash] = true;
        
        // Deduct from solver's reward balance
        solverRewards[solver] -= amount;
        
        // Transfer tokens to solver
        bool success = IERC20(token).transfer(solver, amount);
        require(success, "Transfer to solver failed");
        
        emit FundsReleased(solver, token, amount, proofHash);
        emit ProofProcessed(proofHash);
    }
    
    /**
     * @notice Get solver's available reward balance
     * @param solver The solver address
     * @return The available reward amount
     */
    function getSolverReward(address solver) external view returns (uint256) {
        return solverRewards[solver];
    }
}
