import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ARVarietyData {
  variety_id: number;
  variety_name: string | null;
  farm: string | null;
  harvest_date: string | null;
  quantity: number;
  chocolate: string;
  finish: string;
}

export interface Spec extends TurboModule {
  presentAR(varietyData: ARVarietyData): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ARBoxModule');
