import type { NextConfig } from 'next';

// 로컬 개발에서만: `next dev` 는 파이썬 함수(/api/generate)를 못 돌리므로
// PYTHON_API_DEV_URL(예 http://127.0.0.1:8001, scripts/dev_python_api.py)로 넘긴다. 빌드·운영에는 들어가지 않는다.
const pythonDevApi =
  process.env.NODE_ENV !== 'production' ? process.env.PYTHON_API_DEV_URL?.replace(/\/$/, '') : undefined;

const nextConfig: NextConfig = pythonDevApi
  ? {
      async rewrites() {
        return [
          { source: '/api/generate', destination: `${pythonDevApi}/api/generate` },
          // 운영의 가벼운 목록 함수(api/naesin_list.py)는 개발 서버에서 같은 결과를 주는 generate ?list=naesin 으로
          { source: '/api/naesin_list', destination: `${pythonDevApi}/api/generate?list=naesin` },
        ];
      },
    }
  : {};

export default nextConfig;
