export interface Product {
    id: string;
    sku?: string;
    name: string;
    category: string;
    costUSD: number;
    suggestedPriceUSD?: number;
}

export const initialProducts: Product[] = [
    {
        id: "ar-001",
        name: "Implante AnyRidge (Standard)",
        category: "Implantes",
        costUSD: 45,
        suggestedPriceUSD: 120,
    },
    {
        id: "ao-001",
        name: "Implante AnyOne (Internal)",
        category: "Implantes",
        costUSD: 38,
        suggestedPriceUSD: 95,
    },
    {
        id: "tb-001",
        name: "Ti-Base AnyRidge Non-Hex",
        category: "Aditamentos",
        costUSD: 15,
        suggestedPriceUSD: 45,
    },
    {
        id: "tb-002",
        name: "Ti-Base AnyOne Hex",
        category: "Aditamentos",
        costUSD: 12,
        suggestedPriceUSD: 38,
    },
    {
        id: "ao-fixture",
        name: "AnyOne Internal Fixture [AO]",
        category: "Implantes",
        costUSD: 40,
        suggestedPriceUSD: 100,
    },
    {
        id: "ar-fixture",
        name: "AnyRidge Internal Fixture [AR]",
        category: "Implantes",
        costUSD: 45,
        suggestedPriceUSD: 120,
    },
    {
        id: "mn-fixture",
        name: "Mini Internal Fixture [MN]",
        category: "Implantes",
        costUSD: 35,
        suggestedPriceUSD: 90,
    },
    {
        id: "st-fixture",
        name: "ST Internal Fixture [ST]",
        category: "Implantes",
        costUSD: 38,
        suggestedPriceUSD: 95,
    },
    {
        id: "xar-fixture",
        name: "XPEED AnyRidge Internal Fixture [AR]",
        category: "Implantes",
        costUSD: 50,
        suggestedPriceUSD: 130,
    },
    {
        id: "bd-fixture",
        name: "BLUEDIAMOND IMPLANT [BD]",
        category: "Implantes",
        costUSD: 55,
        suggestedPriceUSD: 140,
    }
];
