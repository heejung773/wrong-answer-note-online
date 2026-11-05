/**
 * 교재 목록과 중등 3단 교재(대단원 > 소단원 > 단계) 구조. 생성 화면(app/page.tsx)과
 * 관리자 다운목록의 [다시 받기](lib/reissue.ts)가 같이 쓴다. 비밀 값·네트워크 없음.
 * (2026-11-05 app/page.tsx 에서 그대로 옮김. 값을 바꾸면 lib/wrong-records.ts 의 경로 규칙도 확인)
 */

export type TextbookId =
  | 'synergy-calculus'
  | 'synergy-algebra'
  | 'synergy-common-math-1'
  | 'synergy-common-math-2'
  | 'olympus-calculus'
  | 'gojaengi-common-math-2'
  | 'ssen-common-math-1'
  | 'ssen-middle-2-2'
  | 'blacklabel-middle-2-2'
  | 'concept-middle-2-2'
  | 'basic-ssen-middle-2-2'
  | 'ssen-middle-3-1'
  | 'blacklabel-middle-3-1'
  | 'concept-middle-3-1';

export type Department = 'middle' | 'high';

export type TextbookItem = {
  id: TextbookId;
  title: string;
  subject: string;
  available: boolean;
  department: Department;
};

export const textbooks: TextbookItem[] = [
  // 고등부: 1학년 (공통수학1, 공통수학2)
  {
    id: 'synergy-common-math-1',
    title: '시너지 공통수학1',
    subject: '공통수학1',
    available: true,
    department: 'high',
  },
  {
    id: 'ssen-common-math-1',
    title: '쎈 공통수학1',
    subject: '공통수학1',
    available: true,
    department: 'high',
  },
  {
    id: 'synergy-common-math-2',
    title: '시너지 공통수학2',
    subject: '공통수학2',
    available: true,
    department: 'high',
  },
  {
    id: 'gojaengi-common-math-2',
    title: '고쟁이',
    subject: '공통수학2',
    available: true,
    department: 'high',
  },
  // 고등부: 2학년 (대수, 미적분Ⅰ)
  {
    id: 'synergy-algebra',
    title: '시너지 대수',
    subject: '대수',
    available: true,
    department: 'high',
  },
  {
    id: 'synergy-calculus',
    title: '시너지 미적분',
    subject: '미적분Ⅰ',
    available: true,
    department: 'high',
  },
  {
    id: 'olympus-calculus',
    title: '올림푸스',
    subject: '미적분Ⅰ',
    available: true,
    department: 'high',
  },
  // 중등부: 2학년 2학기
  {
    id: 'ssen-middle-2-2',
    title: '쎈수학',
    subject: '중2-2',
    available: true,
    department: 'middle',
  },
  {
    id: 'blacklabel-middle-2-2',
    title: '블랙라벨',
    subject: '중2-2',
    available: true,
    department: 'middle',
  },
  {
    id: 'concept-middle-2-2',
    title: '개념유형파워',
    subject: '중2-2',
    available: true,
    department: 'middle',
  },
  {
    id: 'basic-ssen-middle-2-2',
    title: '베이직쎈',
    subject: '중2-2',
    available: true,
    department: 'middle',
  },
  // 중등부: 3학년 1학기
  {
    id: 'ssen-middle-3-1',
    title: '쎈수학',
    subject: '중3-1',
    available: true,
    department: 'middle',
  },
  {
    id: 'blacklabel-middle-3-1',
    title: '블랙라벨',
    subject: '중3-1',
    available: true,
    department: 'middle',
  },
  {
    id: 'concept-middle-3-1',
    title: '개념유형파워',
    subject: '중3-1',
    available: true,
    department: 'middle',
  },
];

export const blacklabelHierarchy: Record<string, Record<string, string[]>> = {
  'I. 삼각형의 성질': {
    '01 삼각형의 성질': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
    ],
    '02 삼각형의 외심과 내심': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
      '대단원평가',
    ],
  },
  'II. 사각형의 성질': {
    '03 평행사변형': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
    ],
    '04 여러 가지 사각형': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
      '대단원평가',
    ],
  },
  'III. 도형의 닮음': {
    '05 도형의 닮음': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
    ],
    '06 닮음의 활용': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
      '대단원평가',
    ],
  },
  'IV. 피타고라스 정리': {
    '07 피타고라스 정리': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
      '대단원평가',
    ],
  },
  'V. 확률': {
    '08 경우의 수': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
    ],
    '09 확률': [
      '시험에 꼭 나오는 문제',
      'A등급을 위한 문제',
      '종합 사고력 도전 문제',
      '미리보는 학력평가',
      '대단원평가',
    ],
  },
};

export const conceptHierarchy: Record<string, Record<string, string[]>> = {
  '01_삼각형의_성질': {
    '01_이등변삼각형의_성질': ['01_개념익히기', '02_핵심유형'],
    '02_직각삼각형의_합동_조건': ['01_개념익히기', '02_핵심유형'],
    '03_삼각형의_외심과_내심': [
      '01_개념익히기_1',
      '01_개념익히기_2',
      '02_핵심유형_1',
      '02_핵심유형_2',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '02_사각형의_성질': {
    '01_평행사변형': [
      '01_개념익히기_1',
      '01_개념익히기_2',
      '02_핵심유형_1',
      '02_핵심유형_2',
    ],
    '02_여러가지_사각형': [
      '01_개념익히기_1',
      '01_개념익히기_2',
      '02_핵심유형_1',
      '02_핵심유형_2',
    ],
    '03_평행선과_넓이': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '03_도형의_닮음': {
    '01_닮음도형': ['01_개념익히기', '02_핵심유형'],
    '02_삼각형의_닮음조건': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '04_평행선_사이의_선분의_길이의_비': {
    '01_삼각형과_평행선': ['01_개념익히기', '02_핵심유형'],
    '02_삼각형의_두_변의_중점을_이은_선분의_성질': [
      '01_개념익히기',
      '02_핵심유형',
    ],
    '03_평행선_사이의_선분의_길이의_비': ['01_개념익히기', '02_핵심유형'],
    '04_삼각형의_무게중심': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '05_피타고라스_정리': {
    '01_피타고라스_정리': ['01_개념익히기', '02_핵심유형'],
    '02_피타고라스_정리의_활용': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '06_경우의_수': {
    '01_경우의_수': ['01_개념익히기', '02_핵심유형'],
    '02_여러가지_경우의_수': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
  '07_확률': {
    '01_확률의_뜻과_성질': ['01_개념익히기', '02_핵심유형'],
    '02_확률의_계산': [
      '01_개념익히기',
      '02_핵심유형',
      '03_실력UP문제',
      '04_실전테스트',
    ],
  },
};

export const olympusUnits = [
  '1. 함수의 극한',
  '2. 함수의 연속',
  '3. 미분계수와 도함수',
  '4. 도함수의 활용',
  '5. 부정적분과 정적분',
  '6. 정적분의 활용',
];

export const blacklabel31Hierarchy: Record<string, Record<string, string[]>> = {
  '01_제곱근과_실수': {
    '01_제곱근과_실수': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '02_근호를_포함한_식의_계산': {
    '02_근호를_포함한_식의_계산': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '03_다항식의_곱셈과_곱셈_공식': {
    '03_다항식의_곱셈과_곱셈_공식': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '04_인수분해': {
    '04_인수분해': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '05_이차방정식': {
    '05_이차방정식': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '06_근의_공식': {
    '06_근의_공식': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '07_이차함수와_그래프': {
    '07_이차함수와_그래프': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
  '08_이차함수_y=ax2+bx+c의_그래프': {
    '08_이차함수_y=ax2+bx+c의_그래프': ['Step1', 'Step2', 'Step3', 'Step4'],
  },
};

export const concept31Hierarchy: Record<string, Record<string, string[]>> = {
  '01_제곱근과_실수': {
    '01_제곱근과_실수': ['유형별', '단원마무리'],
  },
  '02_근호를_포함한_식의_계산': {
    '02_근호를_포함한_식의_계산': ['유형별', '단원마무리'],
  },
  '03_다항식의_곱셈': {
    '03_다항식의_곱셈': ['유형별', '단원마무리'],
  },
  '04_인수분해': {
    '04_인수분해': ['유형별', '단원마무리'],
  },
  '05_이차방정식': {
    '05_이차방정식': ['유형별', '단원마무리'],
  },
  '06_이차함수와_그_그래프': {
    '06_이차함수와_그_그래프': ['유형별', '단원마무리'],
  },
};

export const basicSsenHierarchy: Record<string, Record<string, string[]>> = {
  "I. 도형의 성질": {
    "01 삼각형의 성질 (1)": [
      "기본&핵심유형 1 (11~15쪽)",
      "기본&핵심유형 2 (19~21쪽)",
      "꼭 나오는 학교시험기출 (22~23쪽)"
    ],
    "02 삼각형의 성질 (2)": [
      "기본&핵심유형 1 (29~31쪽)",
      "기본&핵심유형 2 (36~40쪽)",
      "꼭 나오는 학교시험기출 (41~42쪽)"
    ],
    "03 사각형의 성질 (1)": [
      "기본&핵심유형 1 (47~50쪽)",
      "기본&핵심유형 2 (54~57쪽)",
      "꼭 나오는 학교시험기출 (58~59쪽)"
    ],
    "04 사각형의 성질 (2)": [
      "기본&핵심유형 1 (66~68쪽)",
      "기본&핵심유형 2 (72~74쪽)",
      "기본&핵심유형 3 (77~81쪽)",
      "꼭 나오는 학교시험기출 (82~84쪽)"
    ]
  },
  "II. 도형의 닮음": {
    "05 도형의 닮음": [
      "기본&핵심유형 1 (91~94쪽)",
      "기본&핵심유형 2 (98~101쪽)",
      "꼭 나오는 학교시험기출 (102~104쪽)"
    ],
    "06 평행선 사이의 선분의 길이의 비": [
      "기본&핵심유형 1 (109~111쪽)",
      "기본&핵심유형 2 (114~115쪽)",
      "꼭 나오는 학교시험기출 (116~117쪽)"
    ],
    "07 삼각형의 무게중심과 닮음의 활용": [
      "기본&핵심유형 1 (121~124쪽)",
      "기본&핵심유형 2 (128~130쪽)",
      "기본&핵심유형 3 (133~135쪽)",
      "꼭 나오는 학교시험기출 (136~138쪽)"
    ]
  },
  "III. 피타고라스 정리": {
    "08 피타고라스 정리": [
      "기본&핵심유형 1 (144~147쪽)",
      "기본&핵심유형 2 (150~151쪽)",
      "기본&핵심유형 3 (155~156쪽)",
      "꼭 나오는 학교시험기출 (157~158쪽)"
    ]
  },
  "IV. 확률": {
    "09 경우의 수": [
      "기본&핵심유형 1 (165~170쪽)",
      "기본&핵심유형 2 (175~178쪽)",
      "꼭 나오는 학교시험기출 (179~180쪽)"
    ],
    "10 확률": [
      "기본&핵심유형 1 (187~189쪽)",
      "기본&핵심유형 2 (193~195쪽)",
      "꼭 나오는 학교시험기출 (196~197쪽)"
    ]
  }
};

/** 생성 화면 '04 표지·서식' 기본값. [다시 받기]도 옛 기록(설정 없음)은 이 값으로 만든다. */
export const PDF_DEFAULTS = {
  includeCover: true,
  includeCharacter: true,
  includeSolutionQr: true,
  academyName: '다산미래학원',
  coverSubtitle: '학생 맞춤형 오답 클리닉 & 실전 평가',
} as const;

/** 표지 '응시 일자' 기본 모양 '2026. 11. 05' (생성 화면 출제 일자 칸과 같은 모양). */
export function formatTestDate(year: number, month: number, day: number): string {
  return `${year}. ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}`;
}

/** 교재 표지 기본 제목(생성 화면 currentCoverTitle 의 기본값). */
export const coverTitleOf = (id: string) => textbooks.find((t) => t.id === id)?.title ?? '';
