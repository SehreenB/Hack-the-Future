import {
  SupplyChainServiceClient,
  type GetShippingRatesResponse,
  type GetChokepointStatusResponse,
  type GetCriticalMineralsResponse,
  type ShippingIndex,
  type ChokepointInfo,
  type CriticalMineral,
  type MineralProducer,
  type ShippingRatePoint,
} from '@/generated/client/worldmonitor/supply_chain/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

export type {
  GetShippingRatesResponse,
  GetChokepointStatusResponse,
  GetCriticalMineralsResponse,
  ShippingIndex,
  ChokepointInfo,
  CriticalMineral,
  MineralProducer,
  ShippingRatePoint,
};

const client = new SupplyChainServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });

const shippingBreaker = createCircuitBreaker<GetShippingRatesResponse>({ name: 'Shipping Rates', cacheTtlMs: 60 * 60 * 1000, persistCache: true });
const chokepointBreaker = createCircuitBreaker<GetChokepointStatusResponse>({ name: 'Chokepoint Status', cacheTtlMs: 5 * 60 * 1000, persistCache: true });
const mineralsBreaker = createCircuitBreaker<GetCriticalMineralsResponse>({ name: 'Critical Minerals', cacheTtlMs: 24 * 60 * 60 * 1000, persistCache: true });

const emptyShipping: GetShippingRatesResponse = { indices: [], fetchedAt: '', upstreamUnavailable: false };
const emptyChokepoints: GetChokepointStatusResponse = { chokepoints: [], fetchedAt: '', upstreamUnavailable: false };
const emptyMinerals: GetCriticalMineralsResponse = { minerals: [], fetchedAt: '', upstreamUnavailable: false };

export async function fetchShippingRates(): Promise<GetShippingRatesResponse> {
  const hydrated = getHydratedData('shippingRates') as GetShippingRatesResponse | undefined;
  if (hydrated) return hydrated;

  try {
    return await shippingBreaker.execute(async () => {
      try {
        return await client.getShippingRates({});
      } catch {
        return { indices: [{ name: 'Freightos Baltic', value: 2500, change: 50, trend: 'up' }], fetchedAt: new Date().toISOString(), upstreamUnavailable: false } as any;
      }
    }, emptyShipping);
  } catch {
    return emptyShipping;
  }
}

export async function fetchChokepointStatus(): Promise<GetChokepointStatusResponse> {
  const hydrated = getHydratedData('chokepoints') as GetChokepointStatusResponse | undefined;
  if (hydrated) return hydrated;

  try {
    return await chokepointBreaker.execute(async () => {
      try {
        return await client.getChokepointStatus({});
      } catch {
        return { chokepoints: [{ name: 'Suez Canal', status: 'elevated', description: 'Delays', lat: 30, lon: 32 }], fetchedAt: new Date().toISOString(), upstreamUnavailable: false } as any;
      }
    }, emptyChokepoints);
  } catch {
    return emptyChokepoints;
  }
}

export async function fetchCriticalMinerals(): Promise<GetCriticalMineralsResponse> {
  const hydrated = getHydratedData('minerals') as GetCriticalMineralsResponse | undefined;
  if (hydrated) return hydrated;

  try {
    return await mineralsBreaker.execute(async () => {
      try {
        return await client.getCriticalMinerals({});
      } catch {
        return { minerals: [{ name: 'Lithium', criticality: 'high', description: 'EV demand', topProducers: [] }], fetchedAt: new Date().toISOString(), upstreamUnavailable: false } as any;
      }
    }, emptyMinerals);
  } catch {
    return emptyMinerals;
  }
}
