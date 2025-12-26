import hre from "hardhat";
import { parseEther } from "viem";
import fs from "fs";
import { network } from "hardhat";

const { viem } = await network.connect();

async function main() {
  const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf8"));
  const [deployer, user] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log(`👤 User (${user.account.address}) Signing Intent...`);

  const domain = {
    name: "NikaProtocol",
    version: "1.0",
    chainId: chainId,
    verifyingContract: deployments.settlement as `0x${string}`,
  };

  const types = {
    Intent: [
      { name: "user", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "tokenOut", type: "address" },
      { name: "amountOut", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ],
  };

  const intent = {
    user: user.account.address,
    tokenIn: deployments.usdc as `0x${string}`,
    amountIn: parseEther("10"),
    tokenOut: deployments.weth as `0x${string}`,
    amountOut: parseEther("200"),
    nonce: 1n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  };

  const signature = await user.signTypedData({
    domain,
    types,
    primaryType: 'Intent',
    message: intent,
  });

  const payload = {
    intent: {
        ...intent,
        amountIn: intent.amountIn.toString(), // JSON can't handle BigInt
        amountOut: intent.amountOut.toString(),
        nonce: intent.nonce.toString(),
        deadline: intent.deadline.toString()
    },
    signature: signature
  };

  fs.writeFileSync("pending_intent.json", JSON.stringify(payload, null, 2));
  console.log("✍️  Intent Broadcasted off-chain!");
}

main();
