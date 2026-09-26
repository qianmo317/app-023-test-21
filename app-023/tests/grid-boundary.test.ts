// 落字拆格边界用例 —— 专测 setStepAt 的拆格重建/失败路径、validateScore 的非法时值定位
// 接续 grid.test.ts 的 T1-T26，本条为 T27 起。断言信息写清「实现里的哪种情形」与预期不符。
import { describe, expect, it } from 'vitest';
import { type Bar, type Step } from '../src/types';
import {
  barTicks,
  isBarFull,
  setStepAt,
  stepAtOffset,
  stepOffsets,
  tieLine,
  validateScore,
} from '../src/lib/grid';
import { newEmptyScore } from '../src/lib/factory';

const st = (beats: number, extra: Partial<Step> = {}): Step => ({ beats, hits: [], ...extra });
const hit = { instrumentId: 'gu', velocity: 2 as const };
const bar = (beatsPerBar: number, steps: Step[], index = 0): Bar => ({ index, beatsPerBar, steps });
const sum = (steps: Step[]) => steps.reduce((s, x) => s + x.beats, 0);

describe('T27-T30 拆格重建：一格内放入不同时值', () => {
  // 4/4 整小节只一段 16 格，在不同偏移放不同时值，验证前/后空段与总和守恒
  const cases: [number, number, number[]][] = [
    // [偏移, 放入格数, 期望各段格数]
    [0, 6, [6, 10]], // 贴头放附点：只留后段
    [0, 1, [1, 15]], // 贴头放 1/4 拍
    [4, 4, [4, 4, 8]], // 正中放整拍：前后皆空段
    [7, 2, [7, 2, 7]], // 奇数偏移放半拍
    [3, 3, [3, 3, 10]], // 附点半拍
    [15, 1, [15, 1]], // 贴尾放：只留前段
  ];
  it.each(cases)('T27 偏移 %i 放 %i 格 → %j，总和仍铺满', (offset, beats, expected) => {
    const b = bar(4, [st(16)]);
    const next = setStepAt(b, offset, { beats, hits: [hit] });
    expect(next, '拆格重建不应失败（实现走了 null 分支）').not.toBeNull();
    expect(next!.map((s) => s.beats), '前后空段格数划分与预期不符').toEqual(expected);
    expect(sum(next!), '拆格后总格数应仍等于整小节').toBe(barTicks(4));
    expect(isBarFull(bar(4, next!)), '拆格后小节应仍铺满').toBe(true);
  });

  it('T28 拆出的前后段必须是空格：hits 清空、tie 清除', () => {
    const b = bar(4, [st(16, { hits: [hit], tie: true })]);
    const next = setStepAt(b, 4, { beats: 4, hits: [hit] })!;
    expect(next.map((s) => s.beats)).toEqual([4, 4, 8]);
    expect(next[0].hits, '前段应拆成空格（hits 未清空）').toEqual([]);
    expect(next[0].tie, '前段不应保留原格的连打记号').toBe(false);
    expect(next[2].hits, '后段应拆成空格（hits 未清空）').toEqual([]);
    expect(next[2].tie, '后段不应保留原格的连打记号').toBe(false);
    expect(next[1].hits, '落字的那一段应带新 hits').toEqual([hit]);
  });

  it('T29 落点正确：新 step 正好落在请求偏移上', () => {
    const b = bar(4, [st(16)]);
    const next = setStepAt(b, 7, { beats: 2, hits: [hit] })!;
    const idx = next.findIndex((s) => s.hits.length > 0);
    expect(stepOffsets({ steps: next })[idx], '新 step 起始偏移与落字位置不符').toBe(7);
    expect(stepAtOffset({ steps: next }, 7), '偏移 7 应命中新 step').toBe(idx);
  });

  it('T30 放入时值大于所在格（跨格溢出）判失败', () => {
    const b = bar(2, [st(4), st(4)]);
    expect(setStepAt(b, 0, { beats: 6, hits: [hit] }), '整格 4 放附点 6 应返回 null').toBeNull();
    expect(setStepAt(b, 2, { beats: 4, hits: [hit] }), '格内偏移 2 放 4 格会溢出，应返回 null').toBeNull();
  });
});

describe('T31-T33 失败路径：非法偏移与空隙', () => {
  const b = () => bar(4, [st(4), st(4), st(4), st(4)]); // 4/4 共 16 格
  it('T31 偏移取负判失败', () => {
    expect(setStepAt(b(), -1, { beats: 1, hits: [hit] }), '负偏移应返回 null').toBeNull();
  });
  it('T32 偏移取到小节末尾之外判失败', () => {
    expect(setStepAt(b(), 16, { beats: 1, hits: [hit] }), '偏移=小节总格数（越界）应返回 null').toBeNull();
    expect(setStepAt(b(), 20, { beats: 1, hits: [hit] }), '偏移超出小节末尾应返回 null').toBeNull();
  });
  it('T33 偏移落在空隙上判失败（小节未铺满时尾后区域是空隙）', () => {
    const gap = bar(4, [st(4), st(4)]); // 只铺了 8/16 格，8..15 是空隙
    expect(stepAtOffset(gap, 10), '空隙处 stepAtOffset 应返回 -1').toBe(-1);
    expect(setStepAt(gap, 10, { beats: 1, hits: [hit] }), '空隙上落字应返回 null').toBeNull();
  });
});

describe('T34-T37 非法时值与整谱校验定位', () => {
  const scoreWith = (badSteps: Step[], badIndex: number) => ({
    ...newEmptyScore('边界'),
    bars: [
      bar(4, [st(4), st(4), st(4), st(4)], 0),
      bar(4, [st(16)], 1),
      bar(4, badSteps, badIndex),
    ],
  });
  it('T34 时值给零判为非法格数', () => {
    const errs = validateScore(scoreWith([st(0), st(16)], 2));
    expect(errs, 'beats=0 应被校验判为非法格数').toContain('第 3 小节存在非法格数');
  });
  it('T35 时值给负数判为非法格数', () => {
    const errs = validateScore(scoreWith([st(-2), st(18)], 2));
    expect(errs, 'beats=-2 应被校验判为非法格数').toContain('第 3 小节存在非法格数');
  });
  it('T36 时值给小数判为非法格数', () => {
    const errs = validateScore(scoreWith([st(1.5), st(14.5)], 2));
    expect(errs, 'beats=1.5（非整数格）应被校验判为非法格数').toContain('第 3 小节存在非法格数');
  });
  it('T37 校验要点出是第几小节，且两类错误不混淆', () => {
    // 非法格数但总和仍满 → 只报「非法格数」，不误报「时值不完整」
    const errs1 = validateScore(scoreWith([st(-2), st(18)], 2));
    expect(errs1, '总和铺满时只应报非法格数这一类').toEqual(['第 3 小节存在非法格数']);
    // 格数合法但没铺满 → 只报「时值不完整」，且指对小节号
    const errs2 = validateScore(scoreWith([st(4), st(4)], 2));
    expect(errs2, '没铺满只应报时值不完整').toEqual(['第 3 小节时值不完整']);
    // 好小节不应被点名
    expect(errs1.join() + errs2.join(), '合法的第 1、2 小节不应出现在错误里').not.toMatch(/第 [12] 小节/);
  });
});

describe('T38-T39 等长替换：分段数不多不少', () => {
  it('T38 两段小节等长替换后仍是两段', () => {
    const b = bar(2, [st(4), st(4)]);
    const next = setStepAt(b, 4, { beats: 4, hits: [hit] })!;
    expect(next.length, '等长替换不应多出/减少分段').toBe(2);
    expect(next.map((s) => s.beats)).toEqual([4, 4]);
    expect(next[1].hits).toEqual([hit]);
  });
  it('T39 多段小节中间等长替换，其余段原样保留', () => {
    const before = [st(4), st(2), st(2), st(4), st(4)];
    const b = bar(4, before);
    const next = setStepAt(b, 4, { beats: 2, hits: [hit] })!;
    expect(next.length, '等长替换不应多出/减少分段').toBe(before.length);
    expect(sum(next), '等长替换后总和应仍等于整小节').toBe(barTicks(4));
    [0, 2, 3, 4].forEach((i) =>
      expect(next[i], `第 ${i} 段不应被等长替换改动`).toEqual(before[i]),
    );
  });
});

describe('T40-T43 连打记号与休止参与铺满', () => {
  it('T40 休止占时值：rest 段计入铺满且整谱校验通过', () => {
    const b = bar(2, [st(4, { rest: true }), st(2, { rest: true }), st(2)], 0);
    expect(isBarFull(b), '休止段应参与铺满').toBe(true);
    expect(validateScore({ ...newEmptyScore('x'), bars: [b] }), '含休止的满小节不应有校验错误').toEqual([]);
  });
  it('T41 连打链参与铺满，连线跨段延伸', () => {
    const b = bar(2, [st(2, { tie: true }), st(2, { tie: true }), st(4)]);
    expect(isBarFull(b), 'tie 段应参与铺满').toBe(true);
    expect(tieLine(b, 0, 10).w, '连线应跨两段 tie 共 8 格宽').toBe(Math.max(8 * 10 - 2, 2));
  });
  it('T42 在休止格内落字：前后拆出的仍是休止空格，总和不变', () => {
    const b = bar(2, [st(4, { rest: true }), st(4)]);
    const next = setStepAt(b, 1, { beats: 1, hits: [hit] })!;
    expect(next.map((s) => s.beats), '休止格应被拆成 前1+字1+后2，其余段不动').toEqual([1, 1, 2, 4]);
    expect(next[0], '前段应保持休止空格').toMatchObject({ rest: true, hits: [] });
    expect(next[2], '后段应保持休止空格').toMatchObject({ rest: true, hits: [] });
    expect(next[3], '未落字的段不应被改动').toEqual(st(4));
    expect(sum(next), '拆休止格后总和应仍等于整小节').toBe(barTicks(2));
  });
  it('T43 等长替换带 tie 的段：结构不变、记号随新 step 走', () => {
    const b = bar(2, [st(4, { tie: true }), st(4)]);
    const next = setStepAt(b, 0, { beats: 4, hits: [hit], tie: true })!;
    expect(next.length, '等长替换 tie 段不应改变分段数').toBe(2);
    expect(next[0].tie, '新 step 的连打记号应保留').toBe(true);
    expect(sum(next)).toBe(barTicks(2));
  });
});
