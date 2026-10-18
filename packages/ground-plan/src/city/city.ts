import type { DistrictForm, Form } from "../archetype/forms";
import type { RoadClass } from "../constants";
import type { Pt } from "../fixed/polygon";
import type { LandUse } from "../land-use/land-use";
import type { Separation } from "../region/separate";

export interface Road {
  readonly pts: readonly Pt[];
  readonly cls: RoadClass;
  /** Fixed units, when the road is drawn narrower than its class: a class that outgrew its right of way. */
  readonly width?: number;
}

export type BlockKind = "built" | "reserve" | "park" | "plaza" | "green";

export interface Block {
  readonly pts: readonly Pt[];
  /** Tint seed of the district the block lies in. */
  readonly district: number;
  readonly kind: BlockKind;
  readonly form?: DistrictForm;
}

export interface Lot {
  readonly pts: readonly Pt[];
  readonly key: string;
  readonly address: string;
  readonly vacant: boolean;
  /** The path of the lot's oldest live member; empty for a vacant lot. */
  readonly path: string;
  readonly use: LandUse;
  readonly district: number;
  readonly form?: DistrictForm;
}

export interface District {
  readonly pts: readonly Pt[];
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly massMille: number;
  readonly form?: Form;
  readonly ward: boolean;
}

export interface TownStats {
  readonly lots: number;
  readonly overflow: number;
  readonly offLand: number;
  readonly docs: number;
  /** Twice the area covered by lots, and twice the town's land, in fixed units². */
  readonly lotArea2: number;
  readonly landArea2: number;
}

export interface Town {
  readonly key: string;
  readonly name: string;
  readonly form: Form;
  readonly old: boolean;
  readonly outline: readonly Pt[];
  readonly water: readonly (readonly Pt[])[];
  /** An archipelago's canals, drawn deeper than water; present only when the town has any. */
  readonly canals?: readonly (readonly Pt[])[];
  readonly roads: readonly Road[];
  readonly blocks: readonly Block[];
  readonly lots: readonly Lot[];
  readonly districts: readonly District[];
  readonly stats: TownStats;
}

export interface City {
  readonly repository: string;
  readonly commit: string;
  readonly towns: readonly Town[];
  readonly highways: readonly Road[];
  /** The separations that would change this city's layout, in `SEPARATIONS` order; absent when none would. */
  readonly separable?: readonly Separation[];
  /** Present when the root manifests declare workspaces, which then decide apps and packages. */
  readonly declared?: true;
}
