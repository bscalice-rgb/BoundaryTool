import { describe, expect, it } from 'vitest';
import { formatLatLon, parseLatLon } from '../lib/coords';

/** Paris, to five decimal places, in GeoJSON [lon, lat] order. */
const PARIS = [2.3522, 48.8566];

const near = (input: string) => {
  const result = parseLatLon(input);
  expect(result, `failed to parse: ${input}`).not.toBeNull();
  expect(result![0]).toBeCloseTo(PARIS[0], 3);
  expect(result![1]).toBeCloseTo(PARIS[1], 3);
};

describe('parsing a position out of what people paste', () => {
  it('reads plain decimal degrees, latitude first', () => {
    near('48.8566, 2.3522');
    near('48.8566,2.3522');
    near('48.8566 2.3522');
  });

  it('reads hemisphere letters on either side of the number', () => {
    near('48.8566 N, 2.3522 E');
    near('N48.8566 E2.3522');
  });

  it('reads the southern and western hemispheres as negative', () => {
    expect(parseLatLon('33.8688 S, 151.2093 E')).toEqual([151.2093, -33.8688]);
    expect(parseLatLon('-33.8688, -70.6693')).toEqual([-70.6693, -33.8688]);
  });

  it('reads degrees, minutes and seconds', () => {
    near(`48°51'23.8"N 2°21'07.9"E`);
    near(`48 51 23.8 N, 2 21 07.9 E`);
  });

  it('reads a Google Maps link', () => {
    near('https://www.google.com/maps/@48.8566,2.3522,15z');
    near('https://maps.google.com/?q=48.8566,2.3522');
  });

  it('reads an OpenStreetMap link', () => {
    near('https://www.openstreetmap.org/#map=15/48.8566/2.3522');
  });

  it('reads a geo: URI, which is what a phone shares', () => {
    near('geo:48.8566,2.3522');
  });

  it('refuses a position that is off the globe', () => {
    expect(parseLatLon('91, 0')).toBeNull();
    expect(parseLatLon('0, 181')).toBeNull();
  });

  it('refuses a place name, because looking one up would mean calling a service', () => {
    expect(parseLatLon('Paris')).toBeNull();
    expect(parseLatLon('')).toBeNull();
    expect(parseLatLon('not a coordinate')).toBeNull();
  });

  it('does not mistake a single number for a pair', () => {
    expect(parseLatLon('48.8566')).toBeNull();
  });

  it('echoes a position back in the form it accepts', () => {
    expect(formatLatLon([2.3522, 48.8566])).toBe('48.85660, 2.35220');
    expect(parseLatLon(formatLatLon([2.3522, 48.8566]))).toEqual([2.3522, 48.8566]);
  });
});
