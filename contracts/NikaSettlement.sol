// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract NikaSettlement is EIP712 {
    
    struct Intent {
        address user;
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 amountOut;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 private constant INTENT_TYPEHASH = keccak256(
        "Intent(address user,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 nonce,uint256 deadline)"
    );

    event Settled(address indexed user, address indexed solver, uint256 amountIn, uint256 amountOut);

    constructor() EIP712("NikaProtocol", "1.0") {}

    function settle(Intent calldata intent, bytes calldata signature) external {
        require(block.timestamp <= intent.deadline, "Intent Expired");

        bytes32 structHash = keccak256(abi.encode(
            INTENT_TYPEHASH,
            intent.user,
            intent.tokenIn,
            intent.amountIn,
            intent.tokenOut,
            intent.amountOut,
            intent.nonce,
            intent.deadline
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        
        require(signer == intent.user, "Invalid Signature");

        bool successUser = IERC20(intent.tokenIn).transferFrom(intent.user, msg.sender, intent.amountIn);
        require(successUser, "Transfer from User failed");

        bool successSolver = IERC20(intent.tokenOut).transferFrom(msg.sender, intent.user, intent.amountOut);
        require(successSolver, "Transfer from Solver failed");

        emit Settled(intent.user, msg.sender, intent.amountIn, intent.amountOut);
    }
}
