/**
 * Check catalog v1 — single source of truth for all verification checks.
 */
export interface CheckDef {
    id: string;
    category: string;
    label: string;
    description: string;
    howToPass: string;
    scope: "record" | "entry";
    status: "shipped" | "planned";
    introducedIn: string;
}
export declare const CATALOG: CheckDef[];
export declare const CATALOG_V03: CheckDef[];
export declare const CATALOG_BY_ID: {
    [k: string]: CheckDef;
};
export declare const SHIPPED_CHECKS: CheckDef[];
export declare const PLANNED_CHECKS: CheckDef[];
export declare const SHIPPED_CHECKS_V03: CheckDef[];
export declare const CATEGORIES: string[];
export declare const CATEGORIES_V03: string[];
//# sourceMappingURL=checks.d.ts.map