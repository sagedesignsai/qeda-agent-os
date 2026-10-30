import {
  chooseTickStep,
  clampScroll,
  formatTimecode,
  snapToCandidates,
  timeToX,
  visibleTimeRange,
  xToTime,
  zoomAround,
} from '@/lib/timeline/time';

describe('timeline time math', () => {
  const view = { pxPerSecond: 100, scrollSeconds: 0 };

  it('round-trips time and pixels', () => {
    expect(timeToX(2, view)).toBe(200);
    expect(xToTime(200, view)).toBe(2);
    expect(timeToX(2.5, { pxPerSecond: 40, scrollSeconds: 2 })).toBeCloseTo(20, 6);
  });

  it('computes the visible range from the scroll position', () => {
    expect(visibleTimeRange({ pxPerSecond: 50, scrollSeconds: 4 }, 500)).toEqual({
      start: 4,
      end: 14,
    });
  });

  it('formats frame-accurate timecode', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00');
    expect(formatTimecode(1.5, 30)).toBe('00:01:15');
    expect(formatTimecode(61.25, 60)).toBe('01:01:15');
  });

  it('picks a ruler step that keeps labels apart', () => {
    expect(chooseTickStep(100)).toBe(1);
    expect(chooseTickStep(10)).toBe(10);
    expect(chooseTickStep(1000)).toBe(0.1);
  });

  it('snaps within a pixel threshold and leaves the rest alone', () => {
    expect(snapToCandidates(1.05, [1, 2, 3], view).target).toBe(1);
    expect(snapToCandidates(1.2, [1, 2, 3], view).target).toBeNull();
    expect(snapToCandidates(1.2, [1, 2, 3], view).time).toBe(1.2);
  });

  it('keeps the anchor time fixed while zooming', () => {
    const zoomed = zoomAround(view, 300, 200);
    expect(zoomed.pxPerSecond).toBe(200);
    expect(timeToX(3, zoomed)).toBeCloseTo(300, 6);
  });

  it('never scrolls before zero', () => {
    expect(clampScroll({ pxPerSecond: 100, scrollSeconds: -5 }, 800, 10).scrollSeconds).toBe(0);
  });
});
