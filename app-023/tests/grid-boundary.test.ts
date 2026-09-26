// 落字拆格边界用例 —— 针对 setStepAt 的拆格重建、非法输入与 tie/rest 铺满
// 与 grid.test.ts 的顺利路径（T15/T16）互补：这里专测「拆、拒、守恒、定位」
import { describe, expect, it } from 'vitest';
import { type Bar, type Step } from '../src/types';
import { barTicks, isBarFull, setStepAt, stepAtOffset, tieLine, validateScore } from '../src/lib/grid';
import { emptyBar, newEmptyScore } from '../src/lib/factory';

const st = (beats: number, extra: Partial<Step> = {}): Step => ({ beats, hits: [], ...extra });
const bar = (beatsPerBar: number, steps: Step[], index = 0): Bar => ({ index, beatsPerBar, steps });
const gu = { instrumentId: 'gu', velocity: 2 as const };
const sum = (steps: Step[]) => steps.reduce((s, x) => s + x.beats, 0);
const scoreWith = (bars: Bar[]) => ({ ...newEmptyScore('t'), bars });

describe('B1-B8 拆格重建：不同时值放入后前后补空、总和守恒', () => {
  it('B1 8 格段正中放 1 格 → 拆成 3+1+4，前后皆为空格', () => {
    const next = setStepAt(bar(2, [st(8)]), 3, { beats: 1, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([3, 1, 4]);
    expect(sum(next!)).toBe(barTicks(2));
    expect(isBarFull({ steps: next!, beatsPerBar: 2 })).toBe(true);
  });
  it('B2 8 格段正中放半拍（2 格）→ 拆成 3+2+3', () => {
    const next = setStepAt(bar(2, [st(8)]), 3, { beats: 2, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([3, 2, 3]);
    expect(sum(next!)).toBe(barTicks(2));
  });
  it('B3 段首放附点半拍（3 格）→ 3+5，只有后段空格', () => {
    const next = setStepAt(bar(2, [st(8)]), 0, { beats: 3, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([3, 5]);
    expect(sum(next!)).toBe(barTicks(2));
  });
  it('B4 段尾放 1/4 拍 → 7+1，只有前段空格', () => {
    const next = setStepAt(bar(2, [st(8)]), 7, { beats: 1, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([7, 1]);
    expect(sum(next!)).toBe(barTicks(2));
  });
  it('B5 拆出的前后空格是「空段」：不带 hits、不带 tie', () => {
    const next = setStepAt(bar(2, [st(8)]), 3, { beats: 2, hits: [gu] })!;
    expect(next[0].hits).toEqual([]);
    expect(next[0].tie).toBeFalsy();
    expect(next[2].hits).toEqual([]);
    expect(next[2].tie).toBeFalsy();
    expect(next[1].hits).toEqual([gu]); // 只有新落的那段带 hits
  });
  it('B6 新时值恰好填满段尾剩余 → 不多出分段', () => {
    const next = setStepAt(bar(2, [st(8)]), 4, { beats: 4, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([4, 4]);
    expect(next!.length).toBe(2);
  });
  it('B7 4/4 空小节第三拍放 1/4 拍 → [4,4,1,3,4]，总和 16', () => {
    const b = emptyBar(0, 4);
    const next = setStepAt(b, 8, { beats: 1, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([4, 4, 1, 3, 4]);
    expect(sum(next!)).toBe(barTicks(4));
  });
  it('B8 时值超过所在段剩余容量 → 失败（不能跨段硬塞）', () => {
    const b = bar(2, [st(4), st(4)]);
    expect(setStepAt(b, 4, { beats: 6, hits: [gu] })).toBeNull(); // 4 格段放附点 6 格
    expect(setStepAt(b, 5, { beats: 4, hits: [gu] })).toBeNull(); // 等长但不对齐段首
  });
});

describe('B9-B12 偏移边界：负值、越界、空隙', () => {
  it('B9 偏移为负 → 失败', () => {
    expect(setStepAt(bar(2, [st(4), st(4)]), -1, { beats: 1, hits: [gu] })).toBeNull();
  });
  it('B10 偏移 ≥ 小节总格数（小节末尾之外）→ 失败', () => {
    const b = bar(2, [st(4), st(4)]);
    expect(setStepAt(b, 8, { beats: 1, hits: [gu] })).toBeNull();
    expect(setStepAt(b, 100, { beats: 1, hits: [gu] })).toBeNull();
  });
  it('B11 偏移落在空隙（小节未铺满的空白区）→ 失败', () => {
    const b = bar(2, [st(4)]); // 只铺满 0..3，4..7 是空隙
    expect(stepAtOffset(b, 6)).toBe(-1);
    expect(setStepAt(b, 6, { beats: 1, hits: [gu] })).toBeNull();
  });
  it('B12 偏移 = 小节最后一格 → 成功且总和守恒', () => {
    const next = setStepAt(bar(2, [st(4), st(4)]), 7, { beats: 1, hits: [gu] });
    expect(next!.map((s) => s.beats)).toEqual([4, 3, 1]);
    expect(sum(next!)).toBe(barTicks(2));
  });
});

describe('B13-B18 非法时值：零、负数、小数', () => {
  it('B13 落字时值给 0 → 判为非法（返回 null）', () => {
    expect(setStepAt(bar(2, [st(4), st(4)]), 0, { beats: 0, hits: [gu] })).toBeNull();
  });
  it('B14 落字时值给负数 → 判为非法（返回 null）', () => {
    expect(setStepAt(bar(2, [st(4), st(4)]), 0, { beats: -2, hits: [gu] })).toBeNull();
  });
  it('B15 落字时值给小数 → 判为非法（返回 null）', () => {
    expect(setStepAt(bar(2, [st(4), st(4)]), 0, { beats: 1.5, hits: [gu] })).toBeNull();
  });
  it('B16 校验点出 0 格所在的小节号（第 2 小节）', () => {
    const errs = validateScore(scoreWith([
      bar(2, [st(4), st(4)], 0),
      bar(2, [st(0), st(4), st(4)], 1), // 总和仍铺满，但含 0 格
      bar(2, [st(4), st(4)], 2),
    ]));
    expect(errs).toEqual(['第 2 小节存在非法格数']);
  });
  it('B17 校验点出负数/小数格所在的小节号', () => {
    const errs = validateScore(scoreWith([
      bar(2, [st(-2), st(6), st(4)], 0), // 负格，总和仍铺满
      bar(2, [st(4), st(4)], 1),
      bar(2, [st(1.5), st(2.5), st(4)], 2), // 小数格，总和仍铺满
    ]));
    expect(errs).toContain('第 1 小节存在非法格数');
    expect(errs).toContain('第 3 小节存在非法格数');
    expect(errs.length).toBe(2); // 铺满的小节不应再报「时值不完整」
  });
  it('B18 未铺满 → 报「时值不完整」并带小节号；合法谱面 → 无错误', () => {
    const errs = validateScore(scoreWith([bar(2, [st(4)], 0), bar(2, [st(4), st(4)], 1)]));
    expect(errs).toEqual(['第 1 小节时值不完整']);
    expect(validateScore(newEmptyScore('ok', 4, 3))).toEqual([]);
  });
});

describe('B19-B21 等长替换：不多不少，正好原段数', () => {
  it('B19 等长替换后段数与时值序列不变', () => {
    const b = bar(2, [st(4), st(2), st(2)]);
    const next = setStepAt(b, 4, { beats: 2, hits: [gu] })!;
    expect(next.length).toBe(b.steps.length);
    expect(next.map((s) => s.beats)).toEqual([4, 2, 2]);
  });
  it('B20 等长替换只改 hits，其他段保持原引用（不做多余重建）', () => {
    const b = bar(2, [st(4), st(2), st(2)]);
    const next = setStepAt(b, 4, { beats: 2, hits: [gu] })!;
    expect(next[0]).toBe(b.steps[0]);
    expect(next[2]).toBe(b.steps[2]);
    expect(next[1].hits).toEqual([gu]);
  });
  it('B21 拆格不改原小节（不可变更新）', () => {
    const b = bar(2, [st(4), st(4)]);
    setStepAt(b, 5, { beats: 1, hits: [gu] });
    expect(b.steps.map((s) => s.beats)).toEqual([4, 4]);
  });
});

describe('B22-B26 连打（tie）与休止（rest）参与铺满', () => {
  it('B22 tie 链参与铺满：2+2+4 铺满 2/4，连线跨步延伸', () => {
    const b = bar(2, [st(2, { tie: true }), st(2, { tie: true }), st(4)]);
    expect(isBarFull(b)).toBe(true);
    expect(validateScore(scoreWith([b]))).toEqual([]);
    expect(tieLine(b, 0, 10).w).toBe(Math.max(8 * 10 - 2, 2)); // 从前两格连到 8 格宽
  });
  it('B23 rest 参与铺满：休止占时值，整谱校验通过', () => {
    const b = bar(2, [st(4, { rest: true }), st(2), st(2)]);
    expect(isBarFull(b)).toBe(true);
    expect(validateScore(scoreWith([b]))).toEqual([]);
  });
  it('B24 拆 rest 段：补出的空格仍是休止，总和守恒', () => {
    const next = setStepAt(bar(2, [st(4, { rest: true }), st(4)]), 1, { beats: 2, hits: [gu] })!;
    expect(next.map((s) => s.beats)).toEqual([1, 2, 1, 4]);
    expect(next[0].rest).toBe(true); // 前段空格沿用休止
    expect(next[2].rest).toBe(true); // 后段空格沿用休止
    expect(next[0].hits).toEqual([]);
    expect(sum(next)).toBe(barTicks(2));
  });
  it('B25 拆 tie 段：补出的空格清掉连线（延续被打断）', () => {
    const next = setStepAt(bar(2, [st(4, { tie: true }), st(4)]), 1, { beats: 1, hits: [gu] })!;
    expect(next.map((s) => s.beats)).toEqual([1, 1, 2, 4]);
    expect(next[0].tie).toBeFalsy();
    expect(next[2].tie).toBeFalsy();
    expect(sum(next)).toBe(barTicks(2));
  });
  it('B26 等长替换把休止换成落字：rest 标志被替换掉，段数不变', () => {
    const b = bar(2, [st(4, { rest: true }), st(4)]);
    const next = setStepAt(b, 0, { beats: 4, hits: [gu] })!;
    expect(next.length).toBe(2);
    expect(next[0].rest).toBeUndefined();
    expect(next[0].hits).toEqual([gu]);
  });
});
