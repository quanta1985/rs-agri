// Loading of map layers (public/data/<id>/) and the delta province lines, shared by every figure on a page.
import { useEffect, useState } from 'react';
import type { LayerMeta, Raw } from '../lib/layer';
import regionsDoc from '../data/regions.json';

export type Layer = { meta: LayerMeta; data: Raw };
export type RegionInfo = { kind: 'delta' | 'site'; name: { vi: string; en: string }; delta?: string };
export const REGIONS = regionsDoc.regions as Record<string, RegionInfo>;

const DATA = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data/`;

const gunzip = async (buf: ArrayBuffer): Promise<ArrayBuffer> => {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // a server already decoded it
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
};

const fetchOk = async (u: string): Promise<Response> => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r;
};

const ARRAYS = { uint8: Uint8Array, uint16: Uint16Array, int16: Int16Array };
const cache = new Map<string, Promise<Layer>>();

/** One download per layer id, cached for the page; a failed load is retried next time. */
export const loadLayer = (id: string): Promise<Layer> => {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const [meta, raw] = await Promise.all([
        fetchOk(`${DATA}${id}/meta.json`).then((r) => r.json() as Promise<LayerMeta>),
        fetchOk(`${DATA}${id}/values.binz`).then((r) => r.arrayBuffer()).then(gunzip),
      ]);
      const data = new ARRAYS[meta.dtype](raw);
      if (data.length !== meta.width * meta.height * meta.times.length) throw new Error(`Data size mismatch in ${id}`);
      return { meta, data };
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
};

export const useLayer = (id: string | null): { layer: Layer | null; error: string | null } => {
  const [state, setState] = useState<{ id: string | null; layer: Layer | null; error: string | null }>({ id: null, layer: null, error: null });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadLayer(id).then((layer) => alive && setState({ id, layer, error: null }),
      (e: unknown) => alive && setState({ id, layer: null, error: e instanceof Error ? e.message : String(e) }));
    return () => { alive = false; };
  }, [id]);
  // never hand back the previous id's layer while the new one loads
  return state.id === id ? { layer: state.layer, error: state.error } : { layer: null, error: null };
};

export type Provinces = { type: 'FeatureCollection'; features: { properties: { name: string; region: string; kind: 'province' | 'region' } }[] };
let provinces: Promise<Provinces> | null = null;
export const loadProvinces = (): Promise<Provinces> =>
  (provinces ??= fetchOk(`${DATA}boundaries/provinces.json`).then((r) => r.json() as Promise<Provinces>)
    .catch((e) => { provinces = null; throw e; }));
