import { SIP } from '../types/sip';
import eipsDataRaw from './sips.json';

export const eipsData = eipsDataRaw as SIP[];

export const eipById: Map<number, SIP> = new Map(
  eipsData.map((sip) => [sip.id, sip])
);
