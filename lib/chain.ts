import { base } from "wagmi/chains";
import type { Address } from "viem";
export const CHAIN=base;
export const ADDRESSES={factory:"0x15a3f3ABb733868d193b511dd5b91f82ebF888A3",hook:"0x8c0986c564025903B0f1C7c87cBA1760cB4FAAcc",escrow:"0xD43586103c760Bd5e139a2De2655413dE441B150",poolManager:"0x498581fF718922c3f8e6A244956aF099B2652b2b",usdc:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",router:"0x6fF5693b99212Da76ad316178A184AB56D299b43",permit2:"0x000000000022D473030F116dDEE9F6B43aC78BA3",weth:"0x4200000000000000000000000000000000000006",eth:"0x0000000000000000000000000000000000000000"} as const satisfies Record<string,Address>;
export const EXTERNAL={x:"https://x.com/twentypad",telegram:"https://t.me/twentypad",github:"https://github.com/twentypad/b20-instant-launcher",factory:`https://basescan.org/address/${ADDRESSES.factory}`} as const;
