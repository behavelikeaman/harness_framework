/**
 * 환경변수 접근자. 프로젝트에서 `process.env`를 직접 참조하는 유일한 모듈이다.
 *
 * 검사는 모듈 로드 시점이 아니라 함수 호출 시점에 한다. 최상단에서 검사하면
 * 키 없이 `npm run build`나 `npm test`가 실패한다.
 */

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function getYoutubeApiKey(): string {
  return readRequired("YOUTUBE_API_KEY");
}

export function getAnthropicApiKey(): string {
  return readRequired("ANTHROPIC_API_KEY");
}
