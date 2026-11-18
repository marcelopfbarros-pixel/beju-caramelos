import { Order, StoreUnit, Customer } from '../types';
import { lookupByCep, searchCepByAddress, extractStreetAndNumber } from './cepService';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OptimizedStop {
  order: Order;
  stopIndex: number;
  coords: LatLng;
  distanceFromPrevKm: number;
  durationFromPrevMin: number;
  cumulativeDistanceKm: number;
  cumulativeDurationMin: number;
}

export interface OptimizedRouteResult {
  originCoords: LatLng;
  stops: OptimizedStop[];
  totalDistanceKm: number;
  totalDurationMin: number;
  usedRoadNetwork: boolean;
}

// Known neighborhood & avenue coordinates in Salvador/BA and São Paulo/SP for instant fallback
const KNOWN_LOCATIONS: Array<{ keywords: string[]; coords: LatLng }> = [
  // Salvador - BA (Store Units & Key Neighborhoods)
  { keywords: ['waldemar falcão', 'waldemar falcao', 'horto florestal', 'horto'], coords: { lat: -12.9968, lng: -38.4939 } },
  { keywords: ['barro vermelho', 'rio vermelho'], coords: { lat: -13.0106, lng: -38.4906 } },
  { keywords: ['shopping paralela', 'luís viana', 'luis viana', 'paralela', 'trobogy'], coords: { lat: -12.9369, lng: -38.3951 } },
  { keywords: ['pituba', 'paulo vi', 'manoel dias'], coords: { lat: -12.9994, lng: -38.4581 } },
  { keywords: ['itaigara', 'acm', 'antônio carlos magalhães'], coords: { lat: -12.9912, lng: -38.4663 } },
  { keywords: ['caminho das árvores', 'caminho das arvores', 'tancredo neves', 'salvador shopping'], coords: { lat: -12.9789, lng: -38.4552 } },
  { keywords: ['barra', 'oceânica', 'oceanica', 'farol da barra'], coords: { lat: -13.0084, lng: -38.5269 } },
  { keywords: ['graça', 'graca', 'euclydes da cunha'], coords: { lat: -12.9992, lng: -38.5208 } },
  { keywords: ['ondina', 'adhemar de barros'], coords: { lat: -13.0098, lng: -38.5082 } },
  { keywords: ['vitória', 'vitoria', 'sete de setembro', 'corredor da vitória'], coords: { lat: -12.9918, lng: -38.5256 } },
  { keywords: ['canela', 'campo grande'], coords: { lat: -12.9896, lng: -38.5194 } },
  { keywords: ['federação', 'federacao', 'cardeal da silva'], coords: { lat: -12.9985, lng: -38.5051 } },
  { keywords: ['brotas', 'dom joão vi', 'dom joao vi', 'acupe'], coords: { lat: -12.9862, lng: -38.4875 } },
  { keywords: ['imbuí', 'imbui', 'jorge amado'], coords: { lat: -12.9685, lng: -38.4318 } },
  { keywords: ['stiep', 'costa azul', 'armação', 'armacao', 'jardim armação'], coords: { lat: -12.9841, lng: -38.4395 } },
  { keywords: ['boca do rio', 'corsário', 'corsario'], coords: { lat: -12.9718, lng: -38.4212 } },
  { keywords: ['patamares', 'pinto de aguiar', 'greenville'], coords: { lat: -12.9562, lng: -38.4041 } },
  { keywords: ['piatã', 'piata', 'orlando gomes'], coords: { lat: -12.9481, lng: -38.3822 } },
  { keywords: ['itapuã', 'itapua', 'dorival caymmi'], coords: { lat: -12.9388, lng: -38.3612 } },
  { keywords: ['stella maris', 'flamengo', 'pedra do sal'], coords: { lat: -12.9225, lng: -38.3324 } },
  { keywords: ['alphaville', 'alphaville 1', 'alphaville 2'], coords: { lat: -12.9432, lng: -38.4105 } },
  { keywords: ['lauro de freitas', 'vilas do atlântico', 'vilas do atlantico', 'buraquinho', 'estrada do coco'], coords: { lat: -12.8886, lng: -38.3168 } },
  { keywords: ['cabula', 'silveira martins', 'horto bela vista'], coords: { lat: -12.9614, lng: -38.4648 } },
  { keywords: ['pernambués', 'pernambues', 'bela vista'], coords: { lat: -12.9715, lng: -38.4671 } },
  // São Paulo - SP (Fallback Mock Data)
  { keywords: ['oscar freire', 'jardins'], coords: { lat: -23.5616, lng: -46.6692 } },
  { keywords: ['bela cintra', 'consolação', 'consolacao'], coords: { lat: -23.5558, lng: -46.6615 } },
  { keywords: ['alameda lorena', 'cerqueira césar', 'cerqueira cesar'], coords: { lat: -23.5665, lng: -46.6648 } },
  { keywords: ['moema', 'ibirapuera'], coords: { lat: -23.6012, lng: -46.6654 } },
  { keywords: ['pinheiros'], coords: { lat: -23.5672, lng: -46.6938 } },
  { keywords: ['barra funda', 'marquês de são vicente', 'padeiros'], coords: { lat: -23.5254, lng: -46.6675 } }
];

const memoryGeoCache = new Map<string, LatLng>();

function getCacheKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function loadCachedCoords(key: string): LatLng | null {
  if (memoryGeoCache.has(key)) return memoryGeoCache.get(key)!;
  try {
    const raw = localStorage.getItem(`beju_geo_v4_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        memoryGeoCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveCachedCoords(key: string, coords: LatLng): void {
  memoryGeoCache.set(key, coords);
  try {
    localStorage.setItem(`beju_geo_v4_${key}`, JSON.stringify(coords));
  } catch {
    // ignore quota errors
  }
}

function isGenericCityCentroid(lat: number, lng: number): boolean {
  const genericCentroids: LatLng[] = [
    { lat: -12.97563, lng: -38.49096 }, // BrasilAPI Salvador generic centroid
    { lat: -12.9714, lng: -38.5014 },
    { lat: -12.9822, lng: -38.4812 },
    { lat: -23.5505, lng: -46.6333 }
  ];
  return genericCentroids.some(
    c => Math.abs(lat - c.lat) < 0.0015 && Math.abs(lng - c.lng) < 0.0015
  );
}

function matchKnownLocation(address: string): LatLng | null {
  const lower = (address || '').toLowerCase();
  for (const entry of KNOWN_LOCATIONS) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.coords;
    }
  }
  return null;
}

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function resolveCoordinates(
  rawAddress: string,
  cep?: string,
  city = 'Salvador',
  state = 'BA'
): Promise<LatLng> {
  const cacheKey = getCacheKey(`${rawAddress}|${cep || ''}|${city}|${state}`);
  const cached = loadCachedCoords(cacheKey);
  if (cached) return cached;

  // 1. Try Photon OpenStreetMap Geocoder (CORS-friendly, fast, no rate-limit blocks)
  if (rawAddress && rawAddress.trim().length > 3) {
    try {
      const { street, numberPart } = extractStreetAndNumber(rawAddress);
      const query = `${street}${numberPart ? ` ${numberPart}` : ''}, ${city}, ${state}, Brasil`;
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const data = await res.json();
        const feat = data?.features?.[0];
        const coordsArr = feat?.geometry?.coordinates;
        const osmType = String(feat?.properties?.type || '').toLowerCase();
        const isGenericCityHit = osmType === 'city' || osmType === 'state' || osmType === 'country';
        if (Array.isArray(coordsArr) && coordsArr.length >= 2 && !isGenericCityHit) {
          const lng = Number(coordsArr[0]);
          const lat = Number(coordsArr[1]);
          if (!Number.isNaN(lat) && !Number.isNaN(lng) && !isGenericCityCentroid(lat, lng)) {
            const coords = { lat, lng };
            saveCachedCoords(cacheKey, coords);
            return coords;
          }
        }
      }
    } catch {
      // continue to next strategy
    }
  }

  // 2. Try BrasilAPI CEP v2 (rejecting generic city centroids)
  const cleanCep = (cep || '').replace(/\D/g, '');
  if (cleanCep.length === 8) {
    try {
      const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
      if (res.ok) {
        const data = await res.json();
        const lat = Number(data?.location?.coordinates?.latitude);
        const lng = Number(data?.location?.coordinates?.longitude);
        if (
          !Number.isNaN(lat) &&
          !Number.isNaN(lng) &&
          lat !== 0 &&
          lng !== 0 &&
          !isGenericCityCentroid(lat, lng)
        ) {
          const coords = { lat, lng };
          saveCachedCoords(cacheKey, coords);
          return coords;
        }
      }
    } catch {
      // continue to next strategy
    }
  }

  // 3. Match against known street/neighborhood coordinates (reliable offline/fallback)
  const known = matchKnownLocation(rawAddress);
  if (known) {
    saveCachedCoords(cacheKey, known);
    return known;
  }

  // 4. Try discovering CEP/neighborhood from street via ViaCEP
  if (!cleanCep && rawAddress && rawAddress.trim().length > 3) {
    try {
      const { street } = extractStreetAndNumber(rawAddress);
      if (street.length >= 3) {
        const cepMatches = await searchCepByAddress(state, city, street);
        if (cepMatches.length > 0) {
          const byBairro = matchKnownLocation(`${cepMatches[0].logradouro} ${cepMatches[0].bairro}`);
          if (byBairro) {
            saveCachedCoords(cacheKey, byBairro);
            return byBairro;
          }
        }
      }
    } catch {
      // continue to fallback
    }
  }

  // Default city center fallback (Salvador or São Paulo)
  if (city.toLowerCase().includes('paulo')) {
    return { lat: -23.5616, lng: -46.6652 };
  }
  return { lat: -12.9822, lng: -38.4812 };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fetches real road driving durations (seconds) and distances (meters) between all points using OSRM Table API.
 * Falls back to Haversine * 1.35 urban road factor (at 28 km/h avg urban speed) if OSRM is unreachable.
 */
async function buildDrivingMatrix(points: LatLng[]): Promise<{
  durationsMin: number[][];
  distancesKm: number[][];
  usedRoadNetwork: boolean;
}> {
  const n = points.length;
  if (n <= 1) {
    return { durationsMin: [[0]], distancesKm: [[0]], usedRoadNetwork: true };
  }

  try {
    const coordsParam = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coordsParam}?annotations=duration,distance`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (
        data.code === 'Ok' &&
        Array.isArray(data.durations) &&
        Array.isArray(data.distances)
      ) {
        const durationsMin = data.durations.map((row: number[]) =>
          row.map(sec => (typeof sec === 'number' ? sec / 60 : 999))
        );
        const distancesKm = data.distances.map((row: number[]) =>
          row.map(meters => (typeof meters === 'number' ? meters / 1000 : 999))
        );
        return { durationsMin, distancesKm, usedRoadNetwork: true };
      }
    }
  } catch {
    // Fallback to Haversine urban estimate below
  }

  const durationsMin: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const distancesKm: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const roadKm = haversineKm(points[i], points[j]) * 1.35;
      distancesKm[i][j] = roadKm;
      durationsMin[i][j] = (roadKm / 28) * 60; // 28 km/h urban traffic average
    }
  }
  return { durationsMin, distancesKm, usedRoadNetwork: false };
}

/**
 * Solves for the open-ended tour starting at node 0 (Unidade) that visits all delivery nodes (1..N)
 * with the minimum total driving duration (Fastest Route).
 */
function solveFastestOrder(durationsMin: number[][]): number[] {
  const totalNodes = durationsMin.length;
  const deliveryCount = totalNodes - 1;
  if (deliveryCount <= 0) return [];
  if (deliveryCount === 1) return [1];

  // For up to 8 delivery stops, exact branch-and-bound / permutation search finds the global optimum in < 2ms
  if (deliveryCount <= 8) {
    const nodes = Array.from({ length: deliveryCount }, (_, i) => i + 1);
    let bestOrder = [...nodes];
    let bestCost = Number.POSITIVE_INFINITY;
    const used = new Array(deliveryCount).fill(false);
    const current: number[] = [];

    const dfs = (lastNode: number, currentCost: number) => {
      if (currentCost >= bestCost) return;
      if (current.length === deliveryCount) {
        bestCost = currentCost;
        bestOrder = [...current];
        return;
      }
      for (let i = 0; i < deliveryCount; i++) {
        if (used[i]) continue;
        const nextNode = nodes[i];
        used[i] = true;
        current.push(nextNode);
        dfs(nextNode, currentCost + durationsMin[lastNode][nextNode]);
        current.pop();
        used[i] = false;
      }
    };

    dfs(0, 0);
    return bestOrder;
  }

  // For > 8 stops: Nearest Neighbor from node 0 + 2-Opt local search refinement
  const unvisited = new Set<number>(Array.from({ length: deliveryCount }, (_, i) => i + 1));
  const tour: number[] = [];
  let curr = 0;
  while (unvisited.size > 0) {
    let nearest = -1;
    let nearestCost = Number.POSITIVE_INFINITY;
    for (const candidate of unvisited) {
      const c = durationsMin[curr][candidate];
      if (c < nearestCost) {
        nearestCost = c;
        nearest = candidate;
      }
    }
    tour.push(nearest);
    unvisited.delete(nearest);
    curr = nearest;
  }

  // 2-Opt refinement on open tour [0, ...tour]
  const path = [0, ...tour];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) {
      for (let k = i + 1; k < path.length; k++) {
        // Compute cost difference of reversing segment path[i..k]
        const before =
          durationsMin[path[i - 1]][path[i]] +
          (k + 1 < path.length ? durationsMin[path[k]][path[k + 1]] : 0);
        // Check if segment reversal is valid (for asymmetric matrices, compute full segment cost)
        let oldSegCost = before;
        for (let m = i; m < k; m++) oldSegCost += durationsMin[path[m]][path[m + 1]];

        const reversed = path.slice(i, k + 1).reverse();
        let newSegCost =
          durationsMin[path[i - 1]][reversed[0]] +
          (k + 1 < path.length ? durationsMin[reversed[reversed.length - 1]][path[k + 1]] : 0);
        for (let m = 0; m < reversed.length - 1; m++) {
          newSegCost += durationsMin[reversed[m]][reversed[m + 1]];
        }

        if (newSegCost + 0.01 < oldSegCost) {
          path.splice(i, k - i + 1, ...reversed);
          improved = true;
        }
      }
    }
  }

  return path.slice(1);
}

export async function computeFastestDeliveryRoute(
  originUnit: StoreUnit | undefined,
  deliveries: Order[],
  customers: Customer[],
  city = 'Salvador',
  state = 'BA'
): Promise<OptimizedRouteResult> {
  const originCoords = await resolveCoordinates(
    originUnit?.endereco || '',
    originUnit?.cep,
    city,
    state
  );

  if (deliveries.length === 0) {
    return {
      originCoords,
      stops: [],
      totalDistanceKm: 0,
      totalDurationMin: 0,
      usedRoadNetwork: true
    };
  }

  // Resolve coordinates for each delivery stop in parallel
  const stopCoords = await Promise.all(
    deliveries.map(order => {
      const normPhone = (order.clienteTelefone || '').replace(/\D/g, '');
      const matchedCustomer = customers.find(
        c =>
          c.telefone.replace(/\D/g, '') === normPhone ||
          c.nome.trim().toLowerCase() === order.clienteNome.trim().toLowerCase()
      );
      const addr = order.enderecoEntrega || order.clienteEndereco || matchedCustomer?.endereco || '';
      return resolveCoordinates(addr, matchedCustomer?.cep, city, state);
    })
  );

  const allPoints: LatLng[] = [originCoords, ...stopCoords];
  const { durationsMin, distancesKm, usedRoadNetwork } = await buildDrivingMatrix(allPoints);
  const optimalNodeOrder = solveFastestOrder(durationsMin);

  let cumulativeKm = 0;
  let cumulativeMin = 0;
  let prevNode = 0;

  const stops: OptimizedStop[] = optimalNodeOrder.map((nodeIdx, idx) => {
    const order = deliveries[nodeIdx - 1];
    const coords = stopCoords[nodeIdx - 1];
    const legKm = distancesKm[prevNode][nodeIdx];
    const legMin = Math.max(1, Math.round(durationsMin[prevNode][nodeIdx]));
    cumulativeKm += legKm;
    cumulativeMin += legMin;
    prevNode = nodeIdx;

    return {
      order,
      stopIndex: idx + 1,
      coords,
      distanceFromPrevKm: Number(legKm.toFixed(1)),
      durationFromPrevMin: legMin,
      cumulativeDistanceKm: Number(cumulativeKm.toFixed(1)),
      cumulativeDurationMin: cumulativeMin
    };
  });

  return {
    originCoords,
    stops,
    totalDistanceKm: Number(cumulativeKm.toFixed(1)),
    totalDurationMin: Math.round(cumulativeMin),
    usedRoadNetwork
  };
}
