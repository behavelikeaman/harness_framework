import { describe, expect, it } from "vitest";

import { formatEngagement, formatRatio, formatViews } from "@/lib/format";

describe("formatRatio", () => {
  it("소수점 1자리 + 배수 기호로 표기한다", () => {
    expect(formatRatio(3.24)).toBe("3.2×");
  });

  it("정수 배수도 소수점 1자리를 유지한다 — 자릿수가 흔들리면 안 된다", () => {
    expect(formatRatio(1)).toBe("1.0×");
  });

  it("1 미만도 그대로 표기한다", () => {
    expect(formatRatio(0.4)).toBe("0.4×");
  });

  it("반올림한다", () => {
    expect(formatRatio(2.06)).toBe("2.1×");
  });

  it("0은 0.0×", () => {
    expect(formatRatio(0)).toBe("0.0×");
  });

  it("NaN·Infinity·음수는 0으로 떨어뜨린다 — 화면에 NaN이 찍히면 안 된다", () => {
    expect(formatRatio(Number.NaN)).toBe("0.0×");
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe("0.0×");
    expect(formatRatio(-1.5)).toBe("0.0×");
  });

  it("화살표나 아이콘 문자를 붙이지 않는다", () => {
    expect(formatRatio(5)).toBe("5.0×");
  });
});

describe("formatViews", () => {
  it("천 단위 구분자를 넣는다", () => {
    expect(formatViews(1_234_567)).toBe("1,234,567");
  });

  it("1,000 미만은 구분자가 없다", () => {
    expect(formatViews(999)).toBe("999");
  });

  it("0은 0", () => {
    expect(formatViews(0)).toBe("0");
  });

  it("소수는 반올림한다 — 조회수에 소수점이 보이면 안 된다", () => {
    expect(formatViews(1234.6)).toBe("1,235");
  });

  it("NaN·Infinity·음수는 0으로 떨어뜨린다", () => {
    expect(formatViews(Number.NaN)).toBe("0");
    expect(formatViews(Number.POSITIVE_INFINITY)).toBe("0");
    expect(formatViews(-10)).toBe("0");
  });
});

describe("formatEngagement", () => {
  it("비율을 백분율 소수점 1자리로 바꾼다", () => {
    expect(formatEngagement(0.0342)).toBe("3.4%");
  });

  it("0.1은 10.0%", () => {
    expect(formatEngagement(0.1)).toBe("10.0%");
  });

  it("0은 0.0%", () => {
    expect(formatEngagement(0)).toBe("0.0%");
  });

  it("NaN·Infinity·음수는 0으로 떨어뜨린다", () => {
    expect(formatEngagement(Number.NaN)).toBe("0.0%");
    expect(formatEngagement(Number.POSITIVE_INFINITY)).toBe("0.0%");
    expect(formatEngagement(-0.01)).toBe("0.0%");
  });
});
