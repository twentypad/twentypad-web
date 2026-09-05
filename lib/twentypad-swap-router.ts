import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  numberToHex,
  parseAbiParameters,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ADDRESSES } from "./chain";
import { isNativeQuote, quoteSymbol } from "./quotes";
import { poolKey, quoterAbi } from "./uniswap-v4";

const FEES = [100, 500, 3000, 10000] as const;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

export function swapRouterAddress() {
  return (process.env.NEXT_PUBLIC_TWENTYPAD_SWAP_ROUTER || ADDRESSES.swapRouter) as Address;
}

export type BridgePlan = { commands: Hex; inputs: Hex[] };
export type BridgeQuote = {
  amountOut: bigint;
  path: Hex;
  label: string;
};
export type AdapterQuote = {
  finalOut: bigint;
  quoteOut: bigint;
  bridge: BridgeQuote | null;
  route: string;
};

export const twentyPadSwapRouterAbi = [
  {
    type: "function",
    name: "buyExactInput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "paymentToken", type: "address" },
          { name: "launchToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minQuoteOut", type: "uint256" },
          { name: "minLaunchOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      {
        name: "bridge",
        type: "tuple",
        components: [
          { name: "commands", type: "bytes" },
          { name: "inputs", type: "bytes[]" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sellExactInput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "launchToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minQuoteOut", type: "uint256" },
          { name: "minOutputOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      {
        name: "bridge",
        type: "tuple",
        components: [
          { name: "commands", type: "bytes" },
          { name: "inputs", type: "bytes[]" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const v3QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

function feeHex(fee: number) {
  return numberToHex(fee, { size: 3 });
}

function v3Path(tokens: Address[], fees: number[]): Hex {
  const parts: Hex[] = [tokens[0] as Hex];
  fees.forEach((fee, index) => {
    parts.push(feeHex(fee), tokens[index + 1] as Hex);
  });
  return concatHex(parts);
}

async function tryQuote(client: PublicClient, path: Hex, amountIn: bigint) {
  try {
    const result = await client.readContract({
      address: ADDRESSES.v3Quoter,
      abi: v3QuoterAbi,
      functionName: "quoteExactInput",
      args: [path, amountIn],
    });
    return result[0];
  } catch {
    return 0n;
  }
}

export async function bestBridgeQuote(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<BridgeQuote | null> {
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    return { amountOut: amountIn, path: "0x", label: quoteSymbol(tokenIn) };
  }

  const nativeIn = isNativeQuote(tokenIn);
  const nativeOut = isNativeQuote(tokenOut);
  const normalizedIn = nativeIn ? ADDRESSES.weth : tokenIn;
  const normalizedOut = nativeOut ? ADDRESSES.weth : tokenOut;
  const candidates: { path: Hex; label: string }[] = [];

  for (const fee of FEES) {
    candidates.push({
      path: v3Path([normalizedIn, normalizedOut], [fee]),
      label: `${quoteSymbol(tokenIn)} → ${quoteSymbol(tokenOut)}`,
    });
  }

  const shouldTryUsdcHop =
    normalizedIn.toLowerCase() !== ADDRESSES.usdc.toLowerCase() &&
    normalizedOut.toLowerCase() !== ADDRESSES.usdc.toLowerCase();
  if (shouldTryUsdcHop) {
    for (const firstFee of FEES) {
      for (const secondFee of FEES) {
        candidates.push({
          path: v3Path(
            [normalizedIn, ADDRESSES.usdc, normalizedOut],
            [firstFee, secondFee],
          ),
          label: `${quoteSymbol(tokenIn)} → USDC → ${quoteSymbol(tokenOut)}`,
        });
      }
    }
  }

  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      amountOut: await tryQuote(client, candidate.path, amountIn),
    })),
  );
  return results.reduce<BridgeQuote | null>(
    (best, current) =>
      current.amountOut > (best?.amountOut ?? 0n) ? current : best,
    null,
  );
}

async function quoteTwentyPad(
  client: PublicClient,
  launchToken: Address,
  quoteToken: Address,
  buy: boolean,
  amountIn: bigint,
) {
  const quoter = process.env.NEXT_PUBLIC_V4_QUOTER_ADDRESS as Address | undefined;
  if (!quoter) throw new Error("TwentyPad v4 quoter is not configured.");
  const key = poolKey(launchToken, quoteToken);
  const result = await client.readContract({
    address: quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: key,
        zeroForOne: buy
          ? key.currency0 === quoteToken
          : key.currency0 === launchToken,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });
  return result[0];
}

export async function quoteAdapterSwap(args: {
  client: PublicClient;
  buy: boolean;
  launchToken: Address;
  quoteToken: Address;
  settlementToken: Address;
  amountIn: bigint;
}): Promise<AdapterQuote> {
  if (args.buy) {
    const bridge =
      args.settlementToken.toLowerCase() === args.quoteToken.toLowerCase()
        ? null
        : await bestBridgeQuote(
            args.client,
            args.settlementToken,
            args.quoteToken,
            args.amountIn,
          );
    if (args.settlementToken.toLowerCase() !== args.quoteToken.toLowerCase() && !bridge) {
      throw new Error("No supported Uniswap bridge route is available.");
    }
    const quoteOut = bridge?.amountOut ?? args.amountIn;
    const finalOut = await quoteTwentyPad(
      args.client,
      args.launchToken,
      args.quoteToken,
      true,
      quoteOut,
    );
    return {
      finalOut,
      quoteOut,
      bridge,
      route: bridge
        ? `${bridge.label} → ${quoteSymbol(args.launchToken) === "Unknown" ? "B20" : quoteSymbol(args.launchToken)}`
        : `${quoteSymbol(args.quoteToken)} → B20`,
    };
  }

  const quoteOut = await quoteTwentyPad(
    args.client,
    args.launchToken,
    args.quoteToken,
    false,
    args.amountIn,
  );
  const bridge =
    args.quoteToken.toLowerCase() === args.settlementToken.toLowerCase()
      ? null
      : await bestBridgeQuote(
          args.client,
          args.quoteToken,
          args.settlementToken,
          quoteOut,
        );
  if (args.quoteToken.toLowerCase() !== args.settlementToken.toLowerCase() && !bridge) {
    throw new Error("No supported Uniswap bridge route is available.");
  }
  return {
    finalOut: bridge?.amountOut ?? quoteOut,
    quoteOut,
    bridge,
    route: bridge ? `B20 → ${bridge.label}` : `B20 → ${quoteSymbol(args.quoteToken)}`,
  };
}

function encodeV3Input(args: {
  recipient: Address;
  amountIn: bigint;
  minOut: bigint;
  path: Hex;
  payerIsUser: boolean;
}) {
  return encodeAbiParameters(
    parseAbiParameters("address,uint256,uint256,bytes,bool,uint256[]"),
    [
      args.recipient,
      args.amountIn,
      args.minOut,
      args.path,
      args.payerIsUser,
      [],
    ],
  );
}

export function buildBridgePlan(args: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOut: bigint;
  path: Hex;
}): BridgePlan {
  if (args.tokenIn.toLowerCase() === args.tokenOut.toLowerCase()) {
    return { commands: "0x", inputs: [] };
  }
  const nativeIn = isNativeQuote(args.tokenIn);
  const nativeOut = isNativeQuote(args.tokenOut);

  if (nativeIn) {
    const wrap = encodeAbiParameters(parseAbiParameters("address,uint256"), [
      ADDRESS_THIS,
      args.amountIn,
    ]);
    const swap = encodeV3Input({
      recipient: swapRouterAddress(),
      amountIn: args.amountIn,
      minOut: args.minOut,
      path: args.path,
      payerIsUser: false,
    });
    return { commands: "0x0b00", inputs: [wrap, swap] };
  }

  if (nativeOut) {
    const swap = encodeV3Input({
      recipient: ADDRESS_THIS,
      amountIn: args.amountIn,
      minOut: args.minOut,
      path: args.path,
      payerIsUser: true,
    });
    const unwrap = encodeAbiParameters(parseAbiParameters("address,uint256"), [
      swapRouterAddress(),
      args.minOut,
    ]);
    return { commands: "0x000c", inputs: [swap, unwrap] };
  }

  return {
    commands: "0x00",
    inputs: [
      encodeV3Input({
        recipient: swapRouterAddress(),
        amountIn: args.amountIn,
        minOut: args.minOut,
        path: args.path,
        payerIsUser: true,
      }),
    ],
  };
}

export function buildAdapterTransaction(args: {
  buy: boolean;
  launchToken: Address;
  quoteToken: Address;
  settlementToken: Address;
  amountIn: bigint;
  minQuoteOut: bigint;
  minFinalOut: bigint;
  deadline: bigint;
  recipient: Address;
  bridge: BridgePlan;
}) {
  const address = swapRouterAddress();
  const data = args.buy
    ? encodeFunctionData({
        abi: twentyPadSwapRouterAbi,
        functionName: "buyExactInput",
        args: [
          {
            paymentToken: args.settlementToken,
            launchToken: args.launchToken,
            quoteToken: args.quoteToken,
            amountIn: args.amountIn,
            minQuoteOut: args.minQuoteOut,
            minLaunchOut: args.minFinalOut,
            deadline: args.deadline,
            recipient: args.recipient,
          },
          args.bridge,
        ],
      })
    : encodeFunctionData({
        abi: twentyPadSwapRouterAbi,
        functionName: "sellExactInput",
        args: [
          {
            launchToken: args.launchToken,
            quoteToken: args.quoteToken,
            outputToken: args.settlementToken,
            amountIn: args.amountIn,
            minQuoteOut: args.minQuoteOut,
            minOutputOut: args.minFinalOut,
            deadline: args.deadline,
            recipient: args.recipient,
          },
          args.bridge,
        ],
      });
  return {
    to: address,
    data,
    value: args.buy && isNativeQuote(args.settlementToken) ? args.amountIn : 0n,
  };
}
