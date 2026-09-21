'use client';

import { SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import {
  ArrowDownAZ,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FileText,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Printer,
  RefreshCw,
  RotateCcw,
  School,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type TextbookId =
  | 'synergy-calculus'
  | 'synergy-algebra'
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


type Department = 'middle' | 'high';

type OlympusItem = {
  id: number;
  unit: string;
  problemType: string;
  numbers: string;
  count: number;
};

type TextbookItem = {
  id: TextbookId;
  title: string;
  subject: string;
  available: boolean;
  department: Department;
};

const textbooks: TextbookItem[] = [
  // 고등부: 1학년 (공통수학1, 공통수학2)
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

type TextbookGroupMeta = {
  key: string;
  title: string;
  subtitle: string;
  headerClass: string;
  rowClass: string;
};

function getTextbookGroupMeta(item: TextbookItem): TextbookGroupMeta {
  if (item.department === 'middle') {
    if (item.subject === '중3-1') {
      return {
        key: 'middle-3-1',
        title: '중3-1',
        subtitle: '3학년 1학기 교재',
        headerClass: 'semester-3-1',
        rowClass: 'textbook-row-3-1',
      };
    }
    return {
      key: 'middle-2-2',
      title: '중2-2',
      subtitle: '2학년 2학기 교재',
      headerClass: 'semester-2-2',
      rowClass: 'textbook-row-2-2',
    };
  }

  // 고등부 (high)
  if (item.subject === '공통수학1' || item.subject === '공통수학2') {
    return {
      key: 'high-1',
      title: '고등 1학년',
      subtitle: '공통수학1 · 공통수학2',
      headerClass: 'semester-high-1',
      rowClass: 'textbook-row-high-1',
    };
  }

  return {
    key: 'high-2',
    title: '고등 2학년',
    subtitle: '대수 · 미적분Ⅰ',
    headerClass: 'semester-high-2',
    rowClass: 'textbook-row-high-2',
  };
}

type BlacklabelItem = {
  id: number;
  chapter: string;
  subunit: string;
  stage: string;
  numbers: string;
  count: number;
};

type ConceptItem = {
  id: number;
  chapter: string;
  subunit: string;
  stage: string;
  numbers: string;
  count: number;
};

const blacklabelHierarchy: Record<string, Record<string, string[]>> = {
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

const conceptHierarchy: Record<string, Record<string, string[]>> = {
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

const conceptStageSlugs: Record<string, string> = {
  '01_개념익히기': 'concept',
  '01_개념익히기_1': 'concept1',
  '01_개념익히기_2': 'concept2',
  '02_핵심유형': 'type',
  '02_핵심유형_1': 'type1',
  '02_핵심유형_2': 'type2',
  '03_실력UP문제': 'power',
  '04_실전테스트': 'test',
};

const conceptRanges: Record<
  string,
  { min: number; max: number; count: number }
> = {
  'ch01/sub01/concept': { min: 1, max: 7, count: 7 },
  'ch01/sub01/type': { min: 8, max: 26, count: 19 },
  'ch01/sub02/concept': { min: 1, max: 8, count: 8 },
  'ch01/sub02/type': { min: 9, max: 20, count: 12 },
  'ch01/sub03/concept1': { min: 1, max: 5, count: 5 },
  'ch01/sub03/concept2': { min: 1, max: 5, count: 5 },
  'ch01/sub03/type1': { min: 6, max: 24, count: 19 },
  'ch01/sub03/type2': { min: 6, max: 36, count: 31 },
  'ch01/sub03/power': { min: 1, max: 3, count: 6 },
  'ch01/sub03/test': { min: 1, max: 18, count: 18 },
  'ch02/sub01/concept1': { min: 1, max: 5, count: 5 },
  'ch02/sub01/concept2': { min: 1, max: 4, count: 4 },
  'ch02/sub01/type1': { min: 6, max: 24, count: 19 },
  'ch02/sub01/type2': { min: 5, max: 17, count: 13 },
  'ch02/sub02/concept1': { min: 1, max: 9, count: 9 },
  'ch02/sub02/concept2': { min: 1, max: 4, count: 4 },
  'ch02/sub02/type1': { min: 10, max: 34, count: 25 },
  'ch02/sub02/type2': { min: 5, max: 16, count: 12 },
  'ch02/sub03/concept': { min: 1, max: 5, count: 5 },
  'ch02/sub03/type': { min: 6, max: 18, count: 13 },
  'ch02/sub03/power': { min: 1, max: 3, count: 6 },
  'ch02/sub03/test': { min: 1, max: 25, count: 25 },
  'ch03/sub01/concept': { min: 1, max: 9, count: 9 },
  'ch03/sub01/type': { min: 10, max: 30, count: 21 },
  'ch03/sub02/concept': { min: 1, max: 9, count: 9 },
  'ch03/sub02/type': { min: 10, max: 34, count: 25 },
  'ch03/sub02/power': { min: 1, max: 3, count: 6 },
  'ch03/sub02/test': { min: 1, max: 18, count: 18 },
  'ch04/sub01/concept': { min: 1, max: 8, count: 8 },
  'ch04/sub01/type': { min: 9, max: 26, count: 18 },
  'ch04/sub02/concept': { min: 1, max: 4, count: 4 },
  'ch04/sub02/type': { min: 5, max: 27, count: 23 },
  'ch04/sub03/concept': { min: 1, max: 4, count: 4 },
  'ch04/sub03/type': { min: 5, max: 21, count: 17 },
  'ch04/sub04/concept': { min: 1, max: 7, count: 7 },
  'ch04/sub04/type': { min: 8, max: 27, count: 20 },
  'ch04/sub04/power': { min: 1, max: 3, count: 6 },
  'ch04/sub04/test': { min: 1, max: 25, count: 25 },
  'ch05/sub01/concept': { min: 1, max: 8, count: 8 },
  'ch05/sub01/type': { min: 9, max: 32, count: 24 },
  'ch05/sub02/concept': { min: 1, max: 4, count: 4 },
  'ch05/sub02/type': { min: 5, max: 16, count: 12 },
  'ch05/sub02/power': { min: 1, max: 3, count: 6 },
  'ch05/sub02/test': { min: 1, max: 18, count: 18 },
  'ch06/sub01/concept': { min: 1, max: 10, count: 10 },
  'ch06/sub01/type': { min: 11, max: 30, count: 20 },
  'ch06/sub02/concept': { min: 1, max: 6, count: 6 },
  'ch06/sub02/type': { min: 7, max: 38, count: 32 },
  'ch06/sub02/power': { min: 1, max: 3, count: 6 },
  'ch06/sub02/test': { min: 1, max: 20, count: 20 },
  'ch07/sub01/concept': { min: 1, max: 9, count: 9 },
  'ch07/sub01/type': { min: 10, max: 30, count: 21 },
  'ch07/sub02/concept': { min: 1, max: 9, count: 9 },
  'ch07/sub02/type': { min: 10, max: 40, count: 31 },
  'ch07/sub02/power': { min: 1, max: 3, count: 6 },
  'ch07/sub02/test': { min: 1, max: 18, count: 18 },
};

const blacklabelStageSlugs: Record<string, string> = {
  '시험에 꼭 나오는 문제': 'must',
  'A등급을 위한 문제': 'grade-a',
  '종합 사고력 도전 문제': 'challenge',
  '미리보는 학력평가': 'mock',
  대단원평가: 'review',
};

const blacklabelChapterSlugs: Record<string, string> = {
  'I. 삼각형의 성질': 'ch1',
  'II. 사각형의 성질': 'ch2',
  'III. 도형의 닮음': 'ch3',
  'IV. 피타고라스 정리': 'ch4',
  'V. 확률': 'ch5',
};

const blacklabelRanges: Record<
  string,
  { min: number; max: number; count: number }
> = {
  'ch1/sub01/challenge': { min: 1, max: 8, count: 8 },
  'ch1/sub01/grade-a': { min: 1, max: 24, count: 24 },
  'ch1/sub01/mock': { min: 1, max: 3, count: 6 },
  'ch1/sub01/must': { min: 1, max: 6, count: 6 },
  'ch1/sub02/challenge': { min: 1, max: 8, count: 8 },
  'ch1/sub02/grade-a': { min: 1, max: 30, count: 30 },
  'ch1/sub02/mock': { min: 1, max: 3, count: 6 },
  'ch1/sub02/must': { min: 1, max: 6, count: 6 },
  'ch1/sub02/review': { min: 1, max: 12, count: 12 },
  'ch2/sub03/challenge': { min: 1, max: 8, count: 8 },
  'ch2/sub03/grade-a': { min: 1, max: 24, count: 24 },
  'ch2/sub03/mock': { min: 1, max: 2, count: 4 },
  'ch2/sub03/must': { min: 1, max: 6, count: 6 },
  'ch2/sub04/challenge': { min: 1, max: 8, count: 8 },
  'ch2/sub04/grade-a': { min: 1, max: 30, count: 30 },
  'ch2/sub04/mock': { min: 1, max: 2, count: 4 },
  'ch2/sub04/must': { min: 1, max: 12, count: 12 },
  'ch2/sub04/review': { min: 1, max: 12, count: 12 },
  'ch3/sub05/challenge': { min: 1, max: 8, count: 8 },
  'ch3/sub05/grade-a': { min: 1, max: 30, count: 30 },
  'ch3/sub05/mock': { min: 1, max: 2, count: 4 },
  'ch3/sub05/must': { min: 1, max: 12, count: 12 },
  'ch3/sub06/challenge': { min: 1, max: 8, count: 8 },
  'ch3/sub06/grade-a': { min: 1, max: 30, count: 30 },
  'ch3/sub06/mock': { min: 1, max: 3, count: 6 },
  'ch3/sub06/must': { min: 1, max: 12, count: 12 },
  'ch3/sub06/review': { min: 1, max: 12, count: 12 },
  'ch4/sub07/challenge': { min: 1, max: 8, count: 8 },
  'ch4/sub07/grade-a': { min: 1, max: 30, count: 30 },
  'ch4/sub07/mock': { min: 1, max: 3, count: 6 },
  'ch4/sub07/must': { min: 1, max: 12, count: 12 },
  'ch4/sub07/review': { min: 1, max: 12, count: 12 },
  'ch5/sub08/challenge': { min: 1, max: 8, count: 8 },
  'ch5/sub08/grade-a': { min: 1, max: 31, count: 31 },
  'ch5/sub08/mock': { min: 1, max: 5, count: 5 },
  'ch5/sub08/must': { min: 1, max: 11, count: 11 },
  'ch5/sub09/challenge': { min: 1, max: 8, count: 8 },
  'ch5/sub09/grade-a': { min: 1, max: 24, count: 24 },
  'ch5/sub09/mock': { min: 1, max: 1, count: 2 },
  'ch5/sub09/must': { min: 1, max: 6, count: 6 },
  'ch5/sub09/review': { min: 1, max: 12, count: 12 },
};

const olympusUnits = [
  '1. 함수의 극한',
  '2. 함수의 연속',
  '3. 미분계수와 도함수',
  '4. 도함수의 활용',
  '5. 부정적분과 정적분',
  '6. 정적분의 활용',
];

const olympusRanges: Record<
  string,
  Record<string, { min: number; max: number; count: number }>
> = {
  '1. 함수의 극한': {
    유형완성하기: { min: 1, max: 56, count: 56 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 3, count: 3 },
  },
  '2. 함수의 연속': {
    유형완성하기: { min: 1, max: 46, count: 46 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 6, count: 6 },
  },
  '3. 미분계수와 도함수': {
    유형완성하기: { min: 1, max: 72, count: 72 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 4, count: 4 },
  },
  '4. 도함수의 활용': {
    유형완성하기: { min: 1, max: 129, count: 129 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 8, count: 8 },
  },
  '5. 부정적분과 정적분': {
    유형완성하기: { min: 1, max: 88, count: 88 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 3, count: 3 },
  },
  '6. 정적분의 활용': {
    유형완성하기: { min: 1, max: 56, count: 56 },
    서술형완성하기: { min: 1, max: 6, count: 6 },
    고난도도전: { min: 1, max: 6, count: 6 },
  },
};

const blacklabel31Hierarchy: Record<string, Record<string, string[]>> = {
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

const concept31Hierarchy: Record<string, Record<string, string[]>> = {
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

type BasicSsenItem = {
  id: number;
  chapter: string;
  subunit: string;
  stage: string;
  numbers: string;
  count: number;
};

const basicSsenHierarchy: Record<string, Record<string, string[]>> = {
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

const basicSsenStageSlugs: Record<string, string> = {
  "꼭 나오는 학교시험기출 (22~23쪽)": "school",
  "기본&핵심유형 1 (11~15쪽)": "basic1",
  "기본&핵심유형 2 (19~21쪽)": "basic2",
  "꼭 나오는 학교시험기출 (41~42쪽)": "school",
  "기본&핵심유형 1 (29~31쪽)": "basic1",
  "기본&핵심유형 2 (36~40쪽)": "basic2",
  "꼭 나오는 학교시험기출 (58~59쪽)": "school",
  "기본&핵심유형 1 (47~50쪽)": "basic1",
  "기본&핵심유형 2 (54~57쪽)": "basic2",
  "꼭 나오는 학교시험기출 (82~84쪽)": "school",
  "기본&핵심유형 1 (66~68쪽)": "basic1",
  "기본&핵심유형 2 (72~74쪽)": "basic2",
  "기본&핵심유형 3 (77~81쪽)": "basic3",
  "꼭 나오는 학교시험기출 (102~104쪽)": "school",
  "기본&핵심유형 1 (91~94쪽)": "basic1",
  "기본&핵심유형 2 (98~101쪽)": "basic2",
  "꼭 나오는 학교시험기출 (116~117쪽)": "school",
  "기본&핵심유형 1 (109~111쪽)": "basic1",
  "기본&핵심유형 2 (114~115쪽)": "basic2",
  "꼭 나오는 학교시험기출 (136~138쪽)": "school",
  "기본&핵심유형 1 (121~124쪽)": "basic1",
  "기본&핵심유형 2 (128~130쪽)": "basic2",
  "기본&핵심유형 3 (133~135쪽)": "basic3",
  "꼭 나오는 학교시험기출 (157~158쪽)": "school",
  "기본&핵심유형 1 (144~147쪽)": "basic1",
  "기본&핵심유형 2 (150~151쪽)": "basic2",
  "기본&핵심유형 3 (155~156쪽)": "basic3",
  "꼭 나오는 학교시험기출 (179~180쪽)": "school",
  "기본&핵심유형 1 (165~170쪽)": "basic1",
  "기본&핵심유형 2 (175~178쪽)": "basic2",
  "꼭 나오는 학교시험기출 (196~197쪽)": "school",
  "기본&핵심유형 1 (187~189쪽)": "basic1",
  "기본&핵심유형 2 (193~195쪽)": "basic2",
  // Legacy with 자신감 prefix
  "자신감 기본&핵심유형 1 (11~15쪽)": "basic1",
  "자신감 기본&핵심유형 2 (19~21쪽)": "basic2",
  "자신감 기본&핵심유형 1 (29~31쪽)": "basic1",
  "자신감 기본&핵심유형 2 (36~40쪽)": "basic2",
  "자신감 기본&핵심유형 1 (47~50쪽)": "basic1",
  "자신감 기본&핵심유형 2 (54~57쪽)": "basic2",
  "자신감 기본&핵심유형 1 (66~68쪽)": "basic1",
  "자신감 기본&핵심유형 2 (72~74쪽)": "basic2",
  "자신감 기본&핵심유형 3 (77~81쪽)": "basic3",
  "자신감 기본&핵심유형 1 (91~94쪽)": "basic1",
  "자신감 기본&핵심유형 2 (98~101쪽)": "basic2",
  "자신감 기본&핵심유형 1 (109~111쪽)": "basic1",
  "자신감 기본&핵심유형 2 (114~115쪽)": "basic2",
  "자신감 기본&핵심유형 1 (121~124쪽)": "basic1",
  "자신감 기본&핵심유형 2 (128~130쪽)": "basic2",
  "자신감 기본&핵심유형 3 (133~135쪽)": "basic3",
  "자신감 기본&핵심유형 1 (144~147쪽)": "basic1",
  "자신감 기본&핵심유형 2 (150~151쪽)": "basic2",
  "자신감 기본&핵심유형 3 (155~156쪽)": "basic3",
  "자신감 기본&핵심유형 1 (165~170쪽)": "basic1",
  "자신감 기본&핵심유형 2 (175~178쪽)": "basic2",
  "자신감 기본&핵심유형 1 (187~189쪽)": "basic1",
  "자신감 기본&핵심유형 2 (193~195쪽)": "basic2"
};

const basicSsenRanges: Record<string, { min: number; max: number; count: number }> = {
  "ch1/sub01/school": {
    "min": 1,
    "max": 13,
    "count": 13
  },
  "ch1/sub01/basic1": {
    "min": 1,
    "max": 30,
    "count": 30
  },
  "ch1/sub01/basic2": {
    "min": 1,
    "max": 17,
    "count": 17
  },
  "ch1/sub02/school": {
    "min": 1,
    "max": 13,
    "count": 13
  },
  "ch1/sub02/basic1": {
    "min": 1,
    "max": 18,
    "count": 18
  },
  "ch1/sub02/basic2": {
    "min": 1,
    "max": 29,
    "count": 29
  },
  "ch1/sub03/school": {
    "min": 1,
    "max": 12,
    "count": 12
  },
  "ch1/sub03/basic1": {
    "min": 1,
    "max": 23,
    "count": 23
  },
  "ch1/sub03/basic2": {
    "min": 1,
    "max": 20,
    "count": 20
  },
  "ch1/sub04/school": {
    "min": 1,
    "max": 17,
    "count": 17
  },
  "ch1/sub04/basic1": {
    "min": 1,
    "max": 18,
    "count": 18
  },
  "ch1/sub04/basic2": {
    "min": 1,
    "max": 15,
    "count": 15
  },
  "ch1/sub04/basic3": {
    "min": 1,
    "max": 26,
    "count": 26
  },
  "ch2/sub05/school": {
    "min": 1,
    "max": 18,
    "count": 18
  },
  "ch2/sub05/basic1": {
    "min": 1,
    "max": 20,
    "count": 20
  },
  "ch2/sub05/basic2": {
    "min": 1,
    "max": 21,
    "count": 21
  },
  "ch2/sub06/school": {
    "min": 1,
    "max": 12,
    "count": 12
  },
  "ch2/sub06/basic1": {
    "min": 1,
    "max": 16,
    "count": 16
  },
  "ch2/sub06/basic2": {
    "min": 1,
    "max": 11,
    "count": 11
  },
  "ch2/sub07/school": {
    "min": 1,
    "max": 17,
    "count": 17
  },
  "ch2/sub07/basic1": {
    "min": 1,
    "max": 21,
    "count": 21
  },
  "ch2/sub07/basic2": {
    "min": 1,
    "max": 18,
    "count": 18
  },
  "ch2/sub07/basic3": {
    "min": 1,
    "max": 18,
    "count": 18
  },
  "ch3/sub08/school": {
    "min": 1,
    "max": 13,
    "count": 13
  },
  "ch3/sub08/basic1": {
    "min": 1,
    "max": 23,
    "count": 23
  },
  "ch3/sub08/basic2": {
    "min": 1,
    "max": 9,
    "count": 9
  },
  "ch3/sub08/basic3": {
    "min": 1,
    "max": 13,
    "count": 13
  },
  "ch4/sub09/school": {
    "min": 1,
    "max": 14,
    "count": 14
  },
  "ch4/sub09/basic1": {
    "min": 1,
    "max": 35,
    "count": 35
  },
  "ch4/sub09/basic2": {
    "min": 1,
    "max": 26,
    "count": 26
  },
  "ch4/sub10/school": {
    "min": 1,
    "max": 13,
    "count": 13
  },
  "ch4/sub10/basic1": {
    "min": 1,
    "max": 20,
    "count": 20
  },
  "ch4/sub10/basic2": {
    "min": 1,
    "max": 20,
    "count": 20
  }
};


const allTextbookInfo: Record<
  string,
  { name: string; max_num: number; desc: string }
> = {
  'synergy-calculus': {
    name: '마플시너지 미적분',
    max_num: 1200,
    desc: '총 1200문항 데이터베이스 연동',
  },
  'synergy-algebra': {
    name: '마플시너지 대수',
    max_num: 1968,
    desc: '총 1968문항 데이터베이스 연동',
  },
  'synergy-common-math-2': {
    name: '마플시너지 공통수학2',
    max_num: 1895,
    desc: '총 1895문항 데이터베이스 연동',
  },
  'olympus-calculus': {
    name: 'EBS 올림포스 미적분',
    max_num: 348,
    desc: '4개 대단원 · 소단원별 총 348문항 데이터베이스 연동',
  },
  'gojaengi-common-math-2': {
    name: '고쟁이 공통수학2',
    max_num: 380,
    desc: '총 380문항 데이터베이스 연동',
  },
  'ssen-common-math-1': {
    name: '신사고 쎈 공통수학1',
    max_num: 1316,
    desc: '10개 단원 총 927문항 데이터베이스 연동',
  },
  'ssen-middle-2-2': {
    name: '신사고 쎈 중2-2',
    max_num: 1154,
    desc: '총 1154문항 데이터베이스 연동',
  },
  'blacklabel-middle-2-2': {
    name: '블랙라벨 중2-2',
    max_num: 100,
    desc: '대단원·소단원·단계별 문항 데이터베이스 연동',
  },
  'concept-middle-2-2': {
    name: '개념유형파워 중2-2',
    max_num: 100,
    desc: '대단원·소단원·유형별 문항 데이터베이스 연동',
  },
  'basic-ssen-middle-2-2': {
    name: '신사고 베이직쎈 중2-2',
    max_num: 35,
    desc: '10개 소단원 · 33개 단계 (총 609문항) 데이터베이스 연동',
  },
  'ssen-middle-3-1': {
    name: '신사고 쎈 중3-1',
    max_num: 1398,
    desc: '총 989문항 데이터베이스 연동',
  },
  'blacklabel-middle-3-1': {
    name: '블랙라벨 중3-1',
    max_num: 100,
    desc: '8개 대단원 · 4개 Step 문항 데이터베이스 연동',
  },
  'concept-middle-3-1': {
    name: '개념유형파워 중3-1',
    max_num: 100,
    desc: '6개 대단원 · 유형별/단원마무리 문항 데이터베이스 연동',
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const loginDomain =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? 'academy.local';

function countProblemNumbers(raw: string) {
  let count = 0;
  for (const token of raw.trim().split(/[\s,]+/)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      count += 1;
      continue;
    }
    const range = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (!range) throw new Error(`알 수 없는 문제번호 입력: ${token}`);
    count += Math.abs(Number(range[2]) - Number(range[1])) + 1;
  }
  if (!count) throw new Error('문제번호를 입력하세요.');
  return count;
}

function countProblemTokens(raw: string) {
  let count = 0;
  for (const token of raw.trim().split(/[\s,]+/)) {
    if (!token) continue;
    const range = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      count += Math.abs(Number(range[2]) - Number(range[1])) + 1;
      continue;
    }
    if (/^\d+$/.test(token)) {
      count += 1;
      continue;
    }
    count += 1;
  }
  if (!count) throw new Error('문제번호를 입력하세요.');
  return count;
}

export default function Home() {
  const configured = Boolean(supabaseUrl && supabaseKey);
  const supabase = useMemo(
    () => (configured ? createClient(supabaseUrl, supabaseKey) : null),
    [configured],
  );
  const [sessionToken, setSessionToken] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [student, setStudent] = useState('');
  const [grade, setGrade] = useState('1학년');
  const [studentMode, setStudentMode] = useState<'single' | 'batch'>('single');
  const [studentNamesText, setStudentNamesText] = useState(
    '김민준\n이서진\n박도윤\n정시우',
  );
  const [numbers, setNumbers] = useState('1, 2, 3, 4');
  const [department, setDepartment] = useState<Department | null>(null);
  const [textbook, setTextbook] = useState<TextbookId | null>(null);

  const [olympusUnit, setOlympusUnit] = useState(olympusUnits[0]);
  const [olympusType, setOlympusType] = useState('유형완성하기');
  const [olympusItems, setOlympusItems] = useState<OlympusItem[]>([
    {
      id: 1,
      unit: olympusUnits[0],
      problemType: '유형완성하기',
      numbers: '1-4',
      count: 4,
    },
  ]);
  const [blacklabelChapter, setBlacklabelChapter] =
    useState('I. 삼각형의 성질');
  const [blacklabelSubunit, setBlacklabelSubunit] =
    useState('01 삼각형의 성질');
  const [blacklabelStage, setBlacklabelStage] = useState(
    '시험에 꼭 나오는 문제',
  );

  const [blacklabel22Items, setBlacklabel22Items] = useState<BlacklabelItem[]>([
    {
      id: 1,
      chapter: 'I. 삼각형의 성질',
      subunit: '01 삼각형의 성질',
      stage: '시험에 꼭 나오는 문제',
      numbers: '1-3',
      count: 3,
    },
  ]);
  const [blacklabel31Items, setBlacklabel31Items] = useState<BlacklabelItem[]>([
    {
      id: 1,
      chapter: '01_제곱근과_실수',
      subunit: '01_제곱근과_실수',
      stage: 'Step1',
      numbers: '1-3',
      count: 3,
    },
  ]);

  const blacklabelItems =
    textbook === 'blacklabel-middle-3-1'
      ? blacklabel31Items
      : blacklabel22Items;
  const setBlacklabelItems = (
    items: BlacklabelItem[] | ((prev: BlacklabelItem[]) => BlacklabelItem[]),
  ) => {
    if (textbook === 'blacklabel-middle-3-1') {
      setBlacklabel31Items(items);
    } else {
      setBlacklabel22Items(items);
    }
  };

  const [conceptChapter, setConceptChapter] = useState('01_삼각형의_성질');
  const [conceptSubunit, setConceptSubunit] = useState(
    '01_이등변삼각형의_성질',
  );
  const [conceptStage, setConceptStage] = useState('01_개념익히기');

  const [concept22Items, setConcept22Items] = useState<ConceptItem[]>([
    {
      id: 1,
      chapter: '01_삼각형의_성질',
      subunit: '01_이등변삼각형의_성질',
      stage: '01_개념익히기',
      numbers: '1-3',
      count: 3,
    },
  ]);
  const [concept31Items, setConcept31Items] = useState<ConceptItem[]>([
    {
      id: 1,
      chapter: '01_제곱근과_실수',
      subunit: '01_제곱근과_실수',
      stage: '유형별',
      numbers: '1-3',
      count: 3,
    },
  ]);

  const conceptItems =
    textbook === 'concept-middle-3-1' ? concept31Items : concept22Items;
  const setConceptItems = (
    items: ConceptItem[] | ((prev: ConceptItem[]) => ConceptItem[]),
  ) => {
    if (textbook === 'concept-middle-3-1') {
      setConcept31Items(items);
    } else {
      setConcept22Items(items);
    }
  };

  const [basicSsenChapter, setBasicSsenChapter] = useState('I. 도형의 성질');
  const [basicSsenSubunit, setBasicSsenSubunit] =
    useState('01 삼각형의 성질 (1)');
  const [basicSsenStage, setBasicSsenStage] = useState(
    '기본&핵심유형 1 (11~15쪽)',
  );
  const [basicSsenItems, setBasicSsenItems] = useState<BasicSsenItem[]>([
    {
      id: 1,
      chapter: 'I. 도형의 성질',
      subunit: '01 삼각형의 성질 (1)',
      stage: '기본&핵심유형 1 (11~15쪽)',
      numbers: '1-4',
      count: 4,
    },
  ]);

  const [status, setStatus] = useState(
    configured ? '로그인이 필요합니다.' : 'Supabase 연결 설정 전입니다.',
  );
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(configured);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<'Fit' | 'FitH'>('Fit');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const previewRequestRef = useRef<AbortController | null>(null);
  const [optionsCollapsed, setOptionsCollapsed] = useState(true);
  const [olympusQuickInput, setOlympusQuickInput] = useState('1-4');
  const [blacklabelQuickInput, setBlacklabelQuickInput] = useState('1-3');
  const [conceptQuickInput, setConceptQuickInput] = useState('1-3');
  const [basicSsenQuickInput, setBasicSsenQuickInput] = useState('1-4');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeCharacter, setIncludeCharacter] = useState(true);
  const [customCharacter, setCustomCharacter] = useState<string | null>(null);
  const [coverTitle, setCoverTitle] = useState('');
  const [academyName, setAcademyName] = useState('다산미래학원');
  const [coverSubtitle, setCoverSubtitle] = useState(
    '학생 맞춤형 오답 클리닉 & 실전 평가',
  );
  const [testDate, setTestDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
  });

  const parsedProblemNumbers = useMemo(() => {
    const result: number[] = [];
    for (const token of numbers.trim().split(/[\s,]+/)) {
      if (!token) continue;
      if (/^\d+$/.test(token)) {
        result.push(Number(token));
        continue;
      }
      const match = token.match(/^(\d+)\s*[-~]\s*(\d+)$/);
      if (match) {
        const start = Number(match[1]);
        const end = Number(match[2]);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          result.push(i);
        }
      }
    }
    return result;
  }, [numbers]);

  const parsedBatchStudentNames = useMemo(() => {
    return Array.from(
      new Set(
        studentNamesText
          .split(/[\n,]+/)
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    );
  }, [studentNamesText]);

  const currentCoverTitle =
    coverTitle ||
    (textbook ? textbooks.find((t) => t.id === textbook)?.title || '' : '');

  const isMiddleDepartment =
    (textbook ? textbooks.find((t) => t.id === textbook)?.department : null) ===
      'middle' || department === 'middle';
  const defaultLogoSrc = isMiddleDepartment
    ? '/middle-logo.png'
    : '/character.png';

  const currentConceptRange = useMemo(() => {
    if (textbook === 'concept-middle-3-1') return null;
    const cSlug = `ch${conceptChapter.slice(0, 2)}`;
    const subSlug = `sub${conceptSubunit.slice(0, 2)}`;
    const sSlug = conceptStageSlugs[conceptStage] || conceptStage;
    return conceptRanges[`${cSlug}/${subSlug}/${sSlug}`] || null;
  }, [conceptChapter, conceptSubunit, conceptStage, textbook]);

  const currentBlacklabelRange = useMemo(() => {
    if (textbook === 'blacklabel-middle-3-1') return null;
    const cSlug = blacklabelChapterSlugs[blacklabelChapter] || 'ch1';
    const subSlug = `sub${blacklabelSubunit.trim().split(' ')[0]}`;
    const sSlug = blacklabelStageSlugs[blacklabelStage] || 'must';
    return blacklabelRanges[`${cSlug}/${subSlug}/${sSlug}`] || null;
  }, [blacklabelChapter, blacklabelSubunit, blacklabelStage, textbook]);

  const currentBasicSsenRange = useMemo(() => {
    if (textbook !== 'basic-ssen-middle-2-2') return null;
    const cSlug =
      basicSsenChapter === 'I. 도형의 성질'
        ? 'ch1'
        : basicSsenChapter === 'II. 도형의 닮음'
        ? 'ch2'
        : basicSsenChapter === 'III. 피타고라스 정리'
        ? 'ch3'
        : 'ch4';
    const subSlug = `sub${basicSsenSubunit.split(' ')[0]}`;
    const sSlug = basicSsenStageSlugs[basicSsenStage] || basicSsenStage;
    return basicSsenRanges[`${cSlug}/${subSlug}/${sSlug}`] || null;
  }, [basicSsenChapter, basicSsenSubunit, basicSsenStage, textbook]);

  function selectTextbook(nextTb: TextbookId) {
    setTextbook(nextTb);
    const nextDept = textbooks.find((t) => t.id === nextTb)?.department;
    if (nextDept) setDepartment(nextDept);
    setPreviewPdfUrl(null);

    if (nextTb === 'ssen-common-math-1') {
      const nums = parsedProblemNumbers;
      if (nums.length === 0 || nums.some((n) => n < 40 || n > 1316)) {
        setNumbers('40, 41, 42, 43');
      }
    } else if (nextTb === 'ssen-middle-2-2') {
      const nums = parsedProblemNumbers;
      if (nums.length === 0 || nums.some((n) => n < 21 || n > 1142)) {
        setNumbers('21, 22, 23, 24');
      }
    } else if (nextTb === 'ssen-middle-3-1') {
      const nums = parsedProblemNumbers;
      if (nums.length === 0 || nums.some((n) => n < 50 || n > 1398)) {
        setNumbers('50, 51, 52, 53');
      }
    } else if (nextTb === 'blacklabel-middle-2-2') {
      setBlacklabelChapter('I. 삼각형의 성질');
      setBlacklabelSubunit('01 삼각형의 성질');
      setBlacklabelStage('시험에 꼭 나오는 문제');
    } else if (nextTb === 'blacklabel-middle-3-1') {
      const firstCh = Object.keys(blacklabel31Hierarchy)[0];
      const firstStg =
        blacklabel31Hierarchy[firstCh]?.[firstCh]?.[0] || 'Step1';
      setBlacklabelChapter(firstCh);
      setBlacklabelSubunit(firstCh);
      setBlacklabelStage(firstStg);
    } else if (nextTb === 'concept-middle-2-2') {
      setConceptChapter('01_삼각형의_성질');
      setConceptSubunit('01_이등변삼각형의_성질');
      setConceptStage('01_개념익히기');
    } else if (nextTb === 'concept-middle-3-1') {
      const firstCh = Object.keys(concept31Hierarchy)[0];
      const firstStg = concept31Hierarchy[firstCh]?.[firstCh]?.[0] || '유형별';
      setConceptChapter(firstCh);
      setConceptSubunit(firstCh);
      setConceptStage(firstStg);
    } else if (nextTb === 'basic-ssen-middle-2-2') {
      setBasicSsenChapter('I. 도형의 성질');
      setBasicSsenSubunit('01 삼각형의 성질 (1)');
      setBasicSsenStage('기본&핵심유형 1 (11~15쪽)');
    } else if (nextTb === 'olympus-calculus') {
      if (olympusItems.length === 0) {
        setOlympusItems([
          {
            id: Date.now(),
            unit: '1. 함수의 극한',
            problemType: '유형완성하기',
            numbers: '1-4',
            count: 4,
          },
        ]);
      }
    } else {
      const nums = parsedProblemNumbers;
      if (nums.length === 0 || nums.some((n) => n < 1)) {
        setNumbers('1, 2, 3, 4');
      }
    }
  }

  function handleCharacterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('이미지 파일(PNG, JPG, WebP 등)만 업로드할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setCustomCharacter(base64);
      setStatus(
        '표지 마스코트/로고 이미지가 등록되었습니다. [미리보기 갱신]을 눌러 확인하세요.',
      );
    };
    reader.readAsDataURL(file);
  }

  function handleResetCharacter() {
    setCustomCharacter(null);
    setStatus(
      isMiddleDepartment
        ? '중등부 기본 로고로 복원되었습니다.'
        : '고등부 기본 마스코트 캐릭터로 복원되었습니다.',
    );
  }

  const highSchoolProblemCount = useMemo(() => {
    if (textbook === 'olympus-calculus') {
      return olympusItems.reduce((acc, item) => acc + item.count, 0);
    }
    if (
      textbook === 'blacklabel-middle-2-2' ||
      textbook === 'blacklabel-middle-3-1'
    ) {
      return blacklabelItems.reduce((acc, item) => acc + item.count, 0);
    }
    if (
      textbook === 'concept-middle-2-2' ||
      textbook === 'concept-middle-3-1'
    ) {
      return conceptItems.reduce((acc, item) => acc + item.count, 0);
    }
    if (textbook === 'basic-ssen-middle-2-2') {
      return basicSsenItems.reduce((acc, item) => acc + item.count, 0);
    }
    return parsedProblemNumbers.length;
  }, [
    textbook,
    olympusItems,
    blacklabelItems,
    conceptItems,
    basicSsenItems,
    parsedProblemNumbers,
  ]);

  const highSchoolPageCount = useMemo(() => {
    if (textbook === 'olympus-calculus') {
      let problemPages = 0;
      let groupType: string | null = null;
      let groupCount = 0;
      for (const item of olympusItems) {
        const type = item.problemType === '고난도도전' ? 'wide' : 'normal';
        if (groupType !== type || groupCount >= 4) {
          if (groupCount > 0) problemPages += 1;
          groupType = type;
          groupCount = 0;
        }
        groupCount += item.count;
        while (groupCount >= 4) {
          problemPages += 1;
          groupCount -= 4;
        }
      }
      if (groupCount > 0) problemPages += 1;
      return problemPages + Math.ceil(highSchoolProblemCount / 40) + (includeCover ? 1 : 0);
    }
    const answerPageSize =
      textbook === 'blacklabel-middle-2-2' ||
      textbook === 'blacklabel-middle-3-1' ||
      textbook === 'basic-ssen-middle-2-2'
        ? 48
        : textbook === 'concept-middle-2-2' ||
            textbook === 'concept-middle-3-1' ||
            textbook === 'gojaengi-common-math-2' ||
            textbook === 'ssen-common-math-1'
          ? 0
          : 60;
    return (
      Math.ceil(highSchoolProblemCount / 4) +
      (answerPageSize ? Math.ceil(highSchoolProblemCount / answerPageSize) : 0) +
      (includeCover ? 1 : 0)
    );
  }, [highSchoolProblemCount, includeCover, olympusItems, textbook]);

  function handleSortNumbers() {
    try {
      const tokens = numbers.trim().split(/[\s,]+/);
      const numList: number[] = [];
      for (const t of tokens) {
        if (!t) continue;
        if (/^\d+$/.test(t)) {
          numList.push(Number(t));
        } else {
          const m = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
          if (m) {
            const s = Number(m[1]);
            const e = Number(m[2]);
            const min = Math.min(s, e);
            const max = Math.max(s, e);
            for (let i = min; i <= max; i++) numList.push(i);
          }
        }
      }
      const uniqueSorted = Array.from(new Set(numList)).sort((a, b) => a - b);
      setNumbers(uniqueSorted.join(', '));
      setStatus('문제 번호를 오름차순으로 정렬했습니다.');
    } catch {
      setStatus('번호 정렬 중 문제가 발생했습니다.');
    }
  }

  function handleRemoveTag(targetNum: number) {
    const tokens = numbers.trim().split(/[\s,]+/);
    const remaining: string[] = [];
    for (const t of tokens) {
      if (!t) continue;
      if (t === String(targetNum)) continue;
      const m = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
      if (m) {
        const s = Number(m[1]);
        const e = Number(m[2]);
        const min = Math.min(s, e);
        const max = Math.max(s, e);
        if (targetNum >= min && targetNum <= max) {
          for (let i = min; i <= max; i++) {
            if (i !== targetNum) remaining.push(String(i));
          }
          continue;
        }
      }
      remaining.push(t);
    }
    setNumbers(remaining.join(', '));
  }

  function handleAddOlympusQuick() {
    try {
      if (!olympusQuickInput.trim()) {
        throw new Error('추가할 문제 번호를 입력해 주세요.');
      }
      const count = countProblemNumbers(olympusQuickInput);
      const currentCount = olympusItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      const newItem: OlympusItem = {
        id: Date.now(),
        unit: olympusUnit,
        problemType: olympusType,
        numbers: olympusQuickInput.trim(),
        count,
      };
      const nextItems = [...olympusItems, newItem];
      setOlympusItems(nextItems);
      setOlympusQuickInput('');
      setStatus(
        `${count}문제를 올림포스 목록에 추가했습니다. 미리보기를 갱신합니다…`,
      );
      void handleRefreshPreview(textbook, { olympusItems: nextItems });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  function handleAddBlacklabelQuick() {
    try {
      if (!blacklabelQuickInput.trim()) {
        throw new Error('추가할 문제 번호를 입력해 주세요.');
      }
      const count = countProblemTokens(blacklabelQuickInput);
      const currentCount = blacklabelItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      if (currentBlacklabelRange) {
        const tokens = blacklabelQuickInput.trim().split(/[\s,]+/);
        for (const t of tokens) {
          if (!t) continue;
          let minVal = 0;
          let maxVal = 0;
          const m = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
          if (m) {
            minVal = Math.min(Number(m[1]), Number(m[2]));
            maxVal = Math.max(Number(m[1]), Number(m[2]));
          } else if (/^\d+$/.test(t)) {
            minVal = Number(t);
            maxVal = Number(t);
          }
          if (minVal > 0) {
            if (
              minVal < currentBlacklabelRange.min ||
              maxVal > currentBlacklabelRange.max
            ) {
              throw new Error(
                `선택한 단계(${blacklabelStage})의 제공 문항은 ${currentBlacklabelRange.min}~${currentBlacklabelRange.max}번입니다. (${t}번 제외 필요)`,
              );
            }
          }
        }
      }
      const newItem: BlacklabelItem = {
        id: Date.now(),
        chapter: blacklabelChapter,
        subunit: blacklabelSubunit,
        stage: blacklabelStage,
        numbers: blacklabelQuickInput.trim(),
        count,
      };
      const nextItems = [...blacklabelItems, newItem];
      setBlacklabelItems(nextItems);
      setBlacklabelQuickInput('');
      setStatus(
        `${count}문제를 블랙라벨 목록에 추가했습니다. 미리보기를 갱신합니다…`,
      );
      void handleRefreshPreview(textbook, { blacklabelItems: nextItems });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  function handleAddConceptQuick() {
    try {
      if (!conceptQuickInput.trim()) {
        throw new Error('추가할 문제 번호를 입력해 주세요.');
      }
      const count = countProblemTokens(conceptQuickInput);
      const currentCount = conceptItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      if (currentConceptRange) {
        const tokens = conceptQuickInput.trim().split(/[\s,]+/);
        for (const t of tokens) {
          if (!t) continue;
          let minVal = 0;
          let maxVal = 0;
          const m = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
          if (m) {
            minVal = Math.min(Number(m[1]), Number(m[2]));
            maxVal = Math.max(Number(m[1]), Number(m[2]));
          } else if (/^\d+$/.test(t)) {
            minVal = Number(t);
            maxVal = Number(t);
          }
          if (minVal > 0) {
            if (
              minVal < currentConceptRange.min ||
              maxVal > currentConceptRange.max
            ) {
              throw new Error(
                `선택한 단계(${conceptStage.replace(/_/g, ' ')})의 제공 문항은 ${currentConceptRange.min}~${currentConceptRange.max}번입니다. (${t}번 제외 필요)`,
              );
            }
          }
        }
      }
      const newItem: ConceptItem = {
        id: Date.now(),
        chapter: conceptChapter,
        subunit: conceptSubunit,
        stage: conceptStage,
        numbers: conceptQuickInput.trim(),
        count,
      };
      const nextItems = [...conceptItems, newItem];
      setConceptItems(nextItems);
      setConceptQuickInput('');
      setStatus(
        `${count}문제를 개념유형파워 목록에 추가했습니다. 미리보기를 갱신합니다…`,
      );
      void handleRefreshPreview(textbook, { conceptItems: nextItems });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  function addBasicSsenItem() {
    try {
      if (!basicSsenQuickInput.trim()) {
        throw new Error('문제번호를 입력해 주세요 (예: 1-10)');
      }
      const count = countProblemTokens(basicSsenQuickInput);
      const currentCount = basicSsenItems.reduce(
        (acc, item) => acc + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error(
          `한 번에 최대 100문제까지 추가할 수 있습니다. (현재: ${currentCount}문제)`,
        );
      }
      if (currentBasicSsenRange) {
        const tokens = basicSsenQuickInput.trim().split(/[\s,]+/);
        for (const t of tokens) {
          if (!t) continue;
          let minVal = 0;
          let maxVal = 0;
          const m = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
          if (m) {
            minVal = Math.min(Number(m[1]), Number(m[2]));
            maxVal = Math.max(Number(m[1]), Number(m[2]));
          } else if (/^\d+$/.test(t)) {
            minVal = Number(t);
            maxVal = Number(t);
          }
          if (minVal > 0) {
            if (
              minVal < currentBasicSsenRange.min ||
              maxVal > currentBasicSsenRange.max
            ) {
              throw new Error(
                `선택한 단계의 제공 문항은 ${currentBasicSsenRange.min}~${currentBasicSsenRange.max}번입니다. (${t}번 제외 필요)`,
              );
            }
          }
        }
      }
      const newItem: BasicSsenItem = {
        id: Date.now(),
        chapter: basicSsenChapter,
        subunit: basicSsenSubunit,
        stage: basicSsenStage,
        numbers: basicSsenQuickInput.trim(),
        count,
      };
      const nextItems = [...basicSsenItems, newItem];
      setBasicSsenItems(nextItems);
      setBasicSsenQuickInput('');
      setStatus(
        `${count}문제를 베이직쎈 목록에 추가했습니다. 미리보기를 갱신합니다…`,
      );
      void handleRefreshPreview(textbook, { basicSsenItems: nextItems });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  async function handleRefreshPreview(
    overrideTb?: unknown,
    overrideItems?: {
      basicSsenItems?: BasicSsenItem[];
      conceptItems?: ConceptItem[];
      blacklabelItems?: BlacklabelItem[];
      olympusItems?: OlympusItem[];
      numbers?: string;
    },
  ) {
    const activeTb =
      (typeof overrideTb === 'string' ? (overrideTb as TextbookId) : null) ||
      textbook;
    if (!sessionToken || !activeTb) return;
    const selectedTextbook = textbooks.find((item) => item.id === activeTb);
    if (!selectedTextbook?.available) {
      setStatus(
        `${selectedTextbook?.title ?? '선택한 교재'}는 아직 준비 중입니다.`,
      );
      return;
    }
    let curOlympus = overrideItems?.olympusItems ?? olympusItems;
    if (
      activeTb === 'olympus-calculus' &&
      curOlympus.length === 0 &&
      !overrideItems?.olympusItems
    ) {
      curOlympus = [
        {
          id: Date.now(),
          unit: olympusUnit,
          problemType: olympusType,
          numbers: '1-4',
          count: 4,
        },
      ];
      setOlympusItems(curOlympus);
    }
    let curBlacklabel = overrideItems?.blacklabelItems ?? blacklabelItems;
    if (activeTb === 'blacklabel-middle-3-1') {
      curBlacklabel = curBlacklabel.filter(
        (it) => it.chapter in blacklabel31Hierarchy,
      );
      if (curBlacklabel.length === 0) {
        curBlacklabel = [
          {
            id: Date.now(),
            chapter: '01_제곱근과_실수',
            subunit: '01_제곱근과_실수',
            stage: 'Step1',
            numbers: '1-3',
            count: 3,
          },
        ];
        setBlacklabel31Items(curBlacklabel);
      }
    } else if (activeTb === 'blacklabel-middle-2-2') {
      curBlacklabel = curBlacklabel.filter(
        (it) => it.chapter in blacklabelHierarchy,
      );
      if (curBlacklabel.length === 0) {
        curBlacklabel = [
          {
            id: Date.now(),
            chapter: 'I. 삼각형의 성질',
            subunit: '01 삼각형의 성질',
            stage: '시험에 꼭 나오는 문제',
            numbers: '1-3',
            count: 3,
          },
        ];
        setBlacklabel22Items(curBlacklabel);
      }
    }

    let curConcept = overrideItems?.conceptItems ?? conceptItems;
    if (activeTb === 'concept-middle-3-1') {
      curConcept = curConcept.filter((it) => it.chapter in concept31Hierarchy);
      if (curConcept.length === 0) {
        curConcept = [
          {
            id: Date.now(),
            chapter: '01_제곱근과_실수',
            subunit: '01_제곱근과_실수',
            stage: '유형별',
            numbers: '1-3',
            count: 3,
          },
        ];
        setConcept31Items(curConcept);
      }
    } else if (activeTb === 'concept-middle-2-2') {
      curConcept = curConcept.filter((it) => it.chapter in conceptHierarchy);
      if (curConcept.length === 0) {
        curConcept = [
          {
            id: Date.now(),
            chapter: '01_삼각형의_성질',
            subunit: '01_이등변삼각형의_성질',
            stage: '01_개념익히기',
            numbers: '1-3',
            count: 3,
          },
        ];
        setConcept22Items(curConcept);
      }
    }

    let curBasicSsen = overrideItems?.basicSsenItems ?? basicSsenItems;
    if (activeTb === 'basic-ssen-middle-2-2') {
      curBasicSsen = curBasicSsen.filter(
        (it) => it.chapter in basicSsenHierarchy,
      );
      if (curBasicSsen.length === 0) {
        curBasicSsen = [
          {
            id: Date.now(),
            chapter: 'I. 도형의 성질',
            subunit: '01 삼각형의 성질 (1)',
            stage: '기본&핵심유형 1 (11~15쪽)',
            numbers: '1-4',
            count: 4,
          },
        ];
        setBasicSsenItems(curBasicSsen);
      }
    }

    if (activeTb === 'olympus-calculus' && curOlympus.length === 0) {
      setPreviewPdfUrl(null);
      setStatus('문항을 목록에 추가한 뒤 미리보기를 확인해 주세요.');
      return;
    }

    let curNumbers = overrideItems?.numbers ?? numbers;
    if (activeTb === 'ssen-common-math-1') {
      const parsed = parsedProblemNumbers;
      if (parsed.length === 0 || parsed.some((n) => n < 40 || n > 1316)) {
        curNumbers = '40, 41, 42, 43';
        setNumbers(curNumbers);
      }
    } else if (activeTb === 'ssen-middle-2-2') {
      const parsed = parsedProblemNumbers;
      if (parsed.length === 0 || parsed.some((n) => n < 21 || n > 1142)) {
        curNumbers = '21, 22, 23, 24';
        setNumbers(curNumbers);
      }
    } else if (activeTb === 'ssen-middle-3-1') {
      const parsed = parsedProblemNumbers;
      if (parsed.length === 0 || parsed.some((n) => n < 50 || n > 1398)) {
        curNumbers = '50, 51, 52, 53';
        setNumbers(curNumbers);
      }
    } else if (
      activeTb !== 'blacklabel-middle-2-2' &&
      activeTb !== 'blacklabel-middle-3-1' &&
      activeTb !== 'concept-middle-2-2' &&
      activeTb !== 'concept-middle-3-1' &&
      activeTb !== 'basic-ssen-middle-2-2' &&
      activeTb !== 'olympus-calculus'
    ) {
      const parsed = parsedProblemNumbers;
      if (parsed.length === 0 || parsed.some((n) => n < 1)) {
        curNumbers = '1, 2, 3, 4';
        setNumbers(curNumbers);
      }
    }

    const activePreviewStudent =
      studentMode === 'batch'
        ? parsedBatchStudentNames[0] || '학생'
        : student || '학생';

    // 교재를 빠르게 바꾸거나 입력값이 연속으로 바뀌면 이전 생성 요청이
    // 새 미리보기를 가로채지 않도록 항상 최신 요청만 유지한다.
    previewRequestRef.current?.abort();
    const controller = new AbortController();
    previewRequestRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    setPreviewLoading(true);
    setStatus('실시간 미리보기 PDF를 생성하고 있습니다…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          textbook: activeTb,
          student: activePreviewStudent,
          studentNames:
            studentMode === 'batch' ? parsedBatchStudentNames : [student],
          isBatch: false,
          preview: true,
          grade,
          numbers: curNumbers,
          olympusUnit,
          olympusType,
          olympusItems: curOlympus.map(({ unit, problemType, numbers }) => ({
            unit,
            problemType,
            numbers,
          })),
          blacklabelItems: curBlacklabel.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          conceptItems: curConcept.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          basicSsenItems: curBasicSsen.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          includeCover,
          coverTitle: currentCoverTitle,
          academyName,
          coverSubtitle,
          testDate,
          includeCharacter,
          customCharacter,
          department: isMiddleDepartment ? 'middle' : 'high',
        }),
      });
      if (!response.ok) {
        const message = await response
          .json()
          .catch(() => ({ error: 'PDF 생성에 실패했습니다.' }));
        throw new Error(message.error);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const result = (await response.json()) as { downloadUrl?: string };
        if (result.downloadUrl) {
          setPreviewPdfUrl(result.downloadUrl);
          setPreviewPage(1);
          setStatus('미리보기가 갱신되었습니다.');
          return;
        }
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }
      setPreviewPdfUrl(url);
      setPreviewPage(1);
      setStatus('미리보기가 최신 상태로 갱신되었습니다.');
    } catch (error) {
      setStatus(
        error instanceof DOMException && error.name === 'AbortError'
          ? '미리보기 생성이 오래 걸려 중단되었습니다. 다시 시도해 주세요.'
          : error instanceof Error
          ? error.message
          : '미리보기 생성에 실패했습니다.',
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (previewRequestRef.current === controller) {
        previewRequestRef.current = null;
        setPreviewLoading(false);
      }
    }
  }

  const handleRefreshPreviewRef = useRef(handleRefreshPreview);
  handleRefreshPreviewRef.current = handleRefreshPreview;

  useEffect(() => {
    if (sessionToken && textbook) {
      void handleRefreshPreviewRef.current(textbook);
    }
  }, [textbook, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !textbook) return;
    const timer = window.setTimeout(() => {
      void handleRefreshPreviewRef.current(textbook);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [grade, numbers, sessionToken, student, textbook]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreviewPage((page) => Math.min(page, Math.max(1, highSchoolPageCount)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [highSchoolPageCount]);

  async function handleDownloadPdf(mode: 'download' | 'print' = 'download') {
    if (!sessionToken || !textbook) return;
    const selectedTextbook = textbooks.find((item) => item.id === textbook);
    if (!selectedTextbook?.available) return;
    if (highSchoolProblemCount === 0) {
      setStatus('문제 번호를 입력해 주세요.');
      return;
    }
    const isBatch =
      studentMode === 'batch' && parsedBatchStudentNames.length > 1;
    const isBatchPrint = mode === 'print' && isBatch;
    const primaryStudent =
      studentMode === 'batch'
        ? parsedBatchStudentNames[0] || '학생'
        : student || '학생';
    setBusy(true);
    setStatus(
      isBatch
        ? `총 ${parsedBatchStudentNames.length}명 학생별 오답노트 ZIP을 생성하고 있습니다…`
        : '오답노트 PDF를 다운로드하는 중…',
    );
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          textbook,
          student: primaryStudent,
          studentNames:
            studentMode === 'batch' ? parsedBatchStudentNames : [student],
          isBatch,
          printBatch: isBatchPrint,
          preview: false,
          grade,
          numbers,
          olympusUnit,
          olympusType,
          olympusItems: olympusItems.map(({ unit, problemType, numbers }) => ({
            unit,
            problemType,
            numbers,
          })),
          blacklabelItems: blacklabelItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          conceptItems: conceptItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          basicSsenItems: basicSsenItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          includeCover,
          coverTitle: currentCoverTitle,
          academyName,
          coverSubtitle,
          testDate,
          includeCharacter,
          customCharacter,
          department: isMiddleDepartment ? 'middle' : 'high',
        }),
      });
      if (!response.ok) {
        const message = await response
          .json()
          .catch(() => ({ error: 'PDF 생성에 실패했습니다.' }));
        throw new Error(message.error);
      }
      const filename = isBatch
        ? `${selectedTextbook.title}_학생별_오답노트_모음.zip`
        : `${primaryStudent}_${grade}_${selectedTextbook.title}_오답노트.pdf`;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const result = (await response.json()) as {
          downloadUrl?: string;
          filename?: string;
        };
        if (!result.downloadUrl) {
          throw new Error('다운로드 주소를 받지 못했습니다.');
        }
        const targetFilename = result.filename || filename;
        const separator = result.downloadUrl.includes('?') ? '&' : '?';
        const link = document.createElement('a');
        link.href = `${result.downloadUrl}${separator}download=${encodeURIComponent(targetFilename)}`;
        link.click();
        setStatus(
          isBatch
            ? `총 ${parsedBatchStudentNames.length}명 학생별 ZIP 다운로드가 시작되었습니다.`
            : '다운로드가 시작되었습니다.',
        );
        return;
      }
      const blob = await response.blob();
      if (isBatchPrint) {
        const printUrl = URL.createObjectURL(blob);
        const printWin = window.open(printUrl, '_blank');
        printWin?.focus();
        printWin?.print();
        setStatus('학생별 표지가 포함된 통합 인쇄 PDF를 열었습니다.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setStatus(
        isBatch
          ? `총 ${parsedBatchStudentNames.length}명 학생별 ZIP 다운로드가 완료되었습니다.`
          : '오답노트 PDF 다운로드가 완료되었습니다.',
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '다운로드에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePrintPdf() {
    if (studentMode === 'batch' && parsedBatchStudentNames.length > 1) {
      await handleDownloadPdf('print');
      return;
    }
    if (previewPdfUrl) {
      const printWin = window.open(previewPdfUrl, '_blank');
      printWin?.focus();
      printWin?.print();
      void fetch('/api/usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          event_type: 'print_started',
          textbook,
          problem_count: numbers.length,
          student_count: 1,
        }),
      });
    } else {
      await handleRefreshPreview();
    }
  }

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionToken(data.session?.access_token ?? '');
      if (data.session) setStatus('오답노트를 만들 준비가 되었습니다.');
      setCheckingSession(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        setSessionToken(session?.access_token ?? '');
        setCheckingSession(false);
      },
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'prepare_wrong_answer_note',
          title: '오답노트 입력 준비',
          description:
            '학생 이름, 학년, 문제번호를 화면에 입력하지만 PDF는 생성하지 않습니다.',
          inputSchema: {
            type: 'object',
            properties: {
              student: { type: 'string' },
              grade: { type: 'string', enum: ['1학년', '2학년', '3학년'] },
              numbers: { type: 'string' },
            },
            required: ['student', 'grade', 'numbers'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input: unknown) {
            const value = input as {
              student?: unknown;
              grade?: unknown;
              numbers?: unknown;
            };
            if (
              typeof value.student !== 'string' ||
              typeof value.numbers !== 'string' ||
              !['1학년', '2학년', '3학년'].includes(String(value.grade))
            ) {
              throw new Error('학생 이름, 학년, 문제번호를 확인해 주세요.');
            }
            setStudent(value.student);
            setGrade(String(value.grade));
            setNumbers(value.numbers);
            setStatus(
              '입력값을 준비했습니다. 로그인 후 PDF 만들기를 누르세요.',
            );
            return { prepared: true, textbook: 'synergy-calculus' };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  async function login(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!loginId.trim() || !password) {
      setStatus('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setBusy(true);
    setStatus('로그인 확인 중…');
    try {
      const normalizedId = loginId.trim();
      const email = normalizedId.includes('@')
        ? normalizedId
        : `${normalizedId}@${loginDomain}`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) {
        setStatus('아이디 또는 비밀번호가 틀렸습니다.');
      } else {
        setSessionToken(data.session.access_token);
        setPassword('');
        setStatus('로그인되었습니다.');
      }
    } catch {
      setStatus(
        '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    setSessionToken('');
    setDepartment(null);
    setTextbook(null);
    setStatus('로그아웃되었습니다.');
  }

  async function generate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken || !textbook) return;
    const selectedTextbook = textbooks.find((item) => item.id === textbook);
    if (!selectedTextbook?.available) {
      setStatus(
        `${selectedTextbook?.title ?? '선택한 교재'}는 온라인 문제 자료를 연결한 뒤 사용할 수 있습니다.`,
      );
      return;
    }
    if (textbook === 'olympus-calculus' && olympusItems.length === 0) {
      setStatus('문제번호를 입력한 뒤 목록에 추가해 주세요.');
      return;
    }
    if (
      (textbook === 'blacklabel-middle-2-2' ||
        textbook === 'blacklabel-middle-3-1') &&
      blacklabelItems.length === 0
    ) {
      setStatus('블랙라벨 문제를 목록에 추가해 주세요.');
      return;
    }
    if (
      (textbook === 'concept-middle-2-2' ||
        textbook === 'concept-middle-3-1') &&
      conceptItems.length === 0
    ) {
      setStatus('개념유형파워 문제를 목록에 추가해 주세요.');
      return;
    }
    if (textbook === 'basic-ssen-middle-2-2' && basicSsenItems.length === 0) {
      setStatus('베이직쎈 문제를 목록에 추가해 주세요.');
      return;
    }
    setBusy(true);
    setStatus('오답노트를 만드는 중…');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          textbook,
          student,
          grade,
          numbers,
          olympusUnit,
          olympusType,
          olympusItems: olympusItems.map(({ unit, problemType, numbers }) => ({
            unit,
            problemType,
            numbers,
          })),
          blacklabelItems: blacklabelItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          conceptItems: conceptItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          basicSsenItems: basicSsenItems.map(
            ({ chapter, subunit, stage, numbers }) => ({
              chapter,
              subunit,
              stage,
              numbers,
            }),
          ),
          includeCover,
          coverTitle: currentCoverTitle,
          academyName,
          coverSubtitle,
          testDate,
          includeCharacter,
          customCharacter,
          department: isMiddleDepartment ? 'middle' : 'high',
        }),
      });
      if (!response.ok) {
        const message = await response
          .json()
          .catch(() => ({ error: 'PDF 생성에 실패했습니다.' }));
        throw new Error(message.error);
      }
      const contentType = response.headers.get('content-type') ?? '';
      const filename = `${student || '학생'}_${grade}_${selectedTextbook.title}_오답노트.pdf`;
      if (contentType.includes('application/json')) {
        const result = (await response.json()) as { downloadUrl?: string };
        if (!result.downloadUrl) {
          throw new Error('임시 PDF 다운로드 주소를 받지 못했습니다.');
        }
        const separator = result.downloadUrl.includes('?') ? '&' : '?';
        const link = document.createElement('a');
        link.href = `${result.downloadUrl}${separator}download=${encodeURIComponent(filename)}`;
        link.click();
        setStatus(
          '큰 PDF 다운로드가 시작되었습니다. 다운로드 주소는 30분 동안 유효합니다.',
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('PDF 다운로드가 시작되었습니다.');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  function addOlympusItem() {
    try {
      const count = countProblemNumbers(numbers);
      const currentCount = olympusItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      setOlympusItems((items) => [
        ...items,
        {
          id: Date.now(),
          unit: olympusUnit,
          problemType: olympusType,
          numbers: numbers.trim(),
          count,
        },
      ]);
      setNumbers('');
      setStatus(`${count}문제를 목록에 추가했습니다.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  function addBlacklabelItem() {
    try {
      const count = countProblemTokens(numbers);
      const currentCount = blacklabelItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      setBlacklabelItems((items) => [
        ...items,
        {
          id: Date.now(),
          chapter: blacklabelChapter,
          subunit: blacklabelSubunit,
          stage: blacklabelStage,
          numbers: numbers.trim(),
          count,
        },
      ]);
      setNumbers('');
      setStatus(`${count}문제를 목록에 추가했습니다.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  function addConceptItem() {
    try {
      const count = countProblemTokens(numbers);
      const currentCount = conceptItems.reduce(
        (total, item) => total + item.count,
        0,
      );
      if (currentCount + count > 100) {
        throw new Error('전체 목록에서 최대 100문제까지 추가할 수 있습니다.');
      }
      setConceptItems((items) => [
        ...items,
        {
          id: Date.now(),
          chapter: conceptChapter,
          subunit: conceptSubunit,
          stage: conceptStage,
          numbers: numbers.trim(),
          count,
        },
      ]);
      setNumbers('');
      setStatus(`${count}문제를 목록에 추가했습니다.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '문제번호를 확인해 주세요.',
      );
    }
  }

  if (sessionToken && textbook) {
    const currentTb = textbooks.find((t) => t.id === textbook);
    const currentTbInfo = allTextbookInfo[textbook] || {
      name: currentTb?.title || '수학 교재',
      max_num: 1000,
      desc: '데이터베이스 연동',
    };

    return (
      <div className="generator-canvas min-h-screen bg-[#0B0C10] text-[#E2E8F0] p-3 sm:p-6 font-sans">
        <div className="max-w-[1680px] mx-auto flex flex-col gap-4">
          {/* Main 2-Column Workspace Grid */}
          <main className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-5 items-start">
            {/* Left Config Panel */}
            <section className="flex flex-col gap-4">
              {/* Step 1: 교재 선택/정보 */}
              <div className="bg-[#151822] border border-[#242938] border-l-4 border-l-cyan-500 rounded-xl shadow-md overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-[#242938] bg-white/[0.015]">
                  <div className="flex items-center gap-2.5">
                    <span className="size-5.5 rounded-full flex items-center justify-center text-xs font-extrabold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      1
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      교재 선택 (Textbook)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e0aa4f] bg-[#5a3b1b] px-3 py-2 text-xs font-extrabold text-[#f7d58a] shadow-sm transition-all hover:bg-[#7a5125] hover:text-white cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="size-3.5" /> 로그아웃
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {/* Selected Department Indicator */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0F1118] rounded-lg border border-[#242938]">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-lg border border-[#e0aa4f] bg-[#5a3b1b] px-3 py-2 text-xs font-extrabold text-[#f7d58a] shadow-sm">
                        현재 위치:{' '}
                        {department === 'middle' ? '중등부' : '고등부'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartment(
                          department === 'middle' ? 'high' : 'middle',
                        );
                        setTextbook(null);
                        setPreviewPdfUrl(null);
                      }}
                      className="inline-flex items-center rounded-lg border border-[#63c5ae] bg-[#26483f] px-3 py-2 text-xs font-extrabold text-[#f7eadf] shadow-sm transition-all hover:bg-[#356b5b] hover:text-white cursor-pointer"
                    >
                      {department === 'middle' ? (
                        <>
                          <GraduationCap className="size-4" /> 고등부 교재
                          바로가기
                        </>
                      ) : (
                        <>
                          <School className="size-4" /> 중등부 교재 바로가기
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <select
                      className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-lg text-slate-100 text-sm outline-none transition-all cursor-pointer"
                      value={textbook}
                      onChange={(e) => {
                        selectTextbook(e.target.value as TextbookId);
                      }}
                    >
                      {department === 'high' ? (
                        <>
                          <optgroup label="고등 1학년 (공통수학1 · 공통수학2)">
                            {textbooks
                              .filter(
                                (tb) =>
                                  tb.department === 'high' &&
                                  (tb.subject === '공통수학1' ||
                                    tb.subject === '공통수학2'),
                              )
                              .map((tb) => (
                                <option key={tb.id} value={tb.id}>
                                  {tb.title} (
                                  {allTextbookInfo[tb.id]?.name || tb.title} -{' '}
                                  {tb.subject})
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="고등 2학년 (대수 · 미적분Ⅰ)">
                            {textbooks
                              .filter(
                                (tb) =>
                                  tb.department === 'high' &&
                                  (tb.subject === '대수' ||
                                    tb.subject === '미적분Ⅰ'),
                              )
                              .map((tb) => (
                                <option key={tb.id} value={tb.id}>
                                  {tb.title} (
                                  {allTextbookInfo[tb.id]?.name || tb.title} -{' '}
                                  {tb.subject})
                                </option>
                              ))}
                          </optgroup>
                        </>
                      ) : department === 'middle' ? (
                        <>
                          <optgroup label="중학교 2학년 2학기 (중2-2)">
                            {textbooks
                              .filter(
                                (tb) =>
                                  tb.department === 'middle' &&
                                  tb.subject === '중2-2',
                              )
                              .map((tb) => (
                                <option key={tb.id} value={tb.id}>
                                  {tb.title} (
                                  {allTextbookInfo[tb.id]?.name || tb.title} -{' '}
                                  {tb.subject})
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="중학교 3학년 1학기 (중3-1)">
                            {textbooks
                              .filter(
                                (tb) =>
                                  tb.department === 'middle' &&
                                  tb.subject === '중3-1',
                              )
                              .map((tb) => (
                                <option key={tb.id} value={tb.id}>
                                  {tb.title} (
                                  {allTextbookInfo[tb.id]?.name || tb.title} -{' '}
                                  {tb.subject})
                                </option>
                              ))}
                          </optgroup>
                        </>
                      ) : (
                        textbooks.map((tb) => (
                          <option key={tb.id} value={tb.id}>
                            {tb.title} (
                            {allTextbookInfo[tb.id]?.name || tb.title} -{' '}
                            {tb.subject})
                          </option>
                        ))
                      )}
                    </select>
                    <small className="block mt-1.5 text-xs text-slate-400">
                      {currentTbInfo.name} ({currentTbInfo.desc})
                    </small>
                  </div>
                </div>
              </div>

              {/* Step 2: 학생 정보 */}
              <div className="bg-[#151822] border border-[#242938] border-l-4 border-l-purple-500 rounded-xl shadow-md overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-[#242938] bg-white/[0.015]">
                  <div className="flex items-center gap-2.5">
                    <span className="size-5.5 rounded-full flex items-center justify-center text-xs font-extrabold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      2
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      학생 정보 입력
                    </h3>
                  </div>
                  <div className="flex items-center bg-[#0F1118] p-0.5 rounded-lg border border-[#242938]">
                    <button
                      type="button"
                      onClick={() => setStudentMode('single')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        studentMode === 'single'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      개별 학생
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentMode('batch')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        studentMode === 'batch'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      다중 일괄(반 전체)
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {studentMode === 'single' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="hs-student-name"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          학생 성명
                        </label>
                        <input
                          id="hs-student-name"
                          type="text"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg text-slate-100 placeholder-slate-500 text-sm outline-none transition-all"
                          placeholder="예: 홍길동 (또는 여러 명 쉼표 구분)"
                          value={student}
                          onChange={(e) => setStudent(e.target.value)}
                        />
                        <small className="block mt-1 text-[11px] text-slate-500">
                          ※ 쉼표로 여러 명(예: 김민준, 이서진)을 적거나 우측
                          [다중 일괄] 탭을 선택하세요.
                        </small>
                      </div>
                      <div>
                        <label
                          htmlFor="hs-student-grade"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          학년 구분
                        </label>
                        <select
                          id="hs-student-grade"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg text-slate-100 text-sm outline-none transition-all cursor-pointer"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                        >
                          <option value="1학년">1학년</option>
                          <option value="2학년">2학년</option>
                          <option value="3학년">3학년</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="hs-batch-names"
                          className="block text-xs font-semibold text-slate-300"
                        >
                          학생 성명 목록{' '}
                          <span className="text-slate-500 font-normal">
                            (줄바꿈 또는 쉼표 구분)
                          </span>
                        </label>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          총 {parsedBatchStudentNames.length}명 입력됨
                        </span>
                      </div>
                      <textarea
                        id="hs-batch-names"
                        rows={3}
                        className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg text-slate-100 placeholder-slate-500 text-sm outline-none font-mono transition-all resize-y"
                        placeholder={'김민준\n이서진\n박도윤\n정시우'}
                        value={studentNamesText}
                        onChange={(e) => setStudentNamesText(e.target.value)}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        <div>
                          <label
                            htmlFor="hs-batch-grade"
                            className="block text-xs font-semibold text-slate-400 mb-1"
                          >
                            공통 학년 구분
                          </label>
                          <select
                            id="hs-batch-grade"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg text-slate-100 text-xs outline-none transition-all cursor-pointer"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                          >
                            <option value="1학년">1학년</option>
                            <option value="2학년">2학년</option>
                            <option value="3학년">3학년</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-purple-300/80 leading-relaxed bg-purple-950/20 border border-purple-800/30 p-2.5 rounded-lg">
                          💡 <strong>일괄 생성 안내:</strong> 각 학생 이름이
                          표지에 개별 인쇄된 시험지가 한 번에 생성되어{' '}
                          <strong>ZIP 압축파일</strong>로 자동 다운로드됩니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: 문항 번호 선택 */}
              <div className="bg-[#151822] border border-[#242938] border-l-4 border-l-blue-500 bg-gradient-to-b from-blue-500/5 to-transparent rounded-xl shadow-md overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-[#242938] bg-white/[0.015]">
                  <div className="flex items-center gap-2.5">
                    <span className="size-5.5 rounded-full flex items-center justify-center text-xs font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      3
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      문제 번호 선택{' '}
                      <span className="text-xs font-normal text-blue-400">
                        (1~{currentTbInfo.max_num}번)
                      </span>
                    </h3>
                  </div>
                  <div className="text-xs text-slate-300 bg-blue-500/15 border border-blue-500/30 px-3 py-1 rounded-full font-medium">
                    총{' '}
                    <strong className="text-blue-400 font-bold">
                      {highSchoolProblemCount}
                    </strong>
                    문항 ({highSchoolPageCount}장)
                  </div>
                </div>
                <div className="p-4">
                  {/* Olympus picker if textbook === 'olympus-calculus' */}
                  {textbook === 'olympus-calculus' && (
                    <div className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-3.5 mb-3.5 shadow-lg">
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 mb-3 border-b border-white/10">
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                          🏛️ 올림포스 단원·소단원 선택기
                        </span>
                        <span className="text-xs text-slate-400">
                          단원과 유형을 고르고 번호를 추가하세요
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label
                            htmlFor="olympus-unit-select"
                            className="block text-xs font-semibold text-slate-400 mb-1"
                          >
                            대단원 선택
                          </label>
                          <select
                            id="olympus-unit-select"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                            value={olympusUnit}
                            onChange={(e) => setOlympusUnit(e.target.value)}
                          >
                            {olympusUnits.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className="block text-xs font-semibold text-slate-400 mb-1">
                            소단원 구분
                          </span>
                          <div className="flex gap-1.5 flex-wrap">
                            {[
                              '유형완성하기',
                              '서술형완성하기',
                              '고난도도전',
                            ].map((t) => (
                              <button
                                key={t}
                                type="button"
                                className={`flex-1 min-w-[85px] py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                                  olympusType === t
                                    ? 'bg-sky-500/25 border-sky-400 text-white shadow-md shadow-sky-500/20'
                                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                                }`}
                                onClick={() => setOlympusType(t)}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          {olympusRanges[olympusUnit]?.[olympusType] && (
                            <p className="mt-1.5 text-[11px] text-emerald-300">
                              제공 문항:{' '}
                              {olympusRanges[olympusUnit][olympusType].min}~
                              {olympusRanges[olympusUnit][olympusType].max}번 (
                              {olympusRanges[olympusUnit][olympusType].count}
                              문제)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-lg border border-white/5">
                        <div className="flex-1">
                          <span className="block text-xs font-bold text-sky-400 mb-1">
                            {olympusUnit.split('.')[0]}단원 · {olympusType}
                          </span>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 placeholder-slate-500 text-xs outline-none"
                            placeholder={`번호 입력 (예: 1-5 또는 1, 3, 7) · ${olympusRanges[olympusUnit]?.[olympusType]?.min}~${olympusRanges[olympusUnit]?.[olympusType]?.max}번`}
                            value={olympusQuickInput}
                            onChange={(e) =>
                              setOlympusQuickInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddOlympusQuick();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow shrink-0 self-end transition-all cursor-pointer"
                          onClick={handleAddOlympusQuick}
                        >
                          + 문항 추가
                        </button>
                      </div>

                      {olympusItems.length > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {olympusItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs bg-slate-900/90 border border-slate-800 rounded px-3 py-2"
                            >
                              <span className="text-slate-200">
                                <span className="text-sky-400 font-semibold">
                                  [{item.unit.split('.')[0]}단원]
                                </span>{' '}
                                {item.problemType} :{' '}
                                <span className="font-mono text-emerald-400 font-bold">
                                  {item.numbers}
                                </span>{' '}
                                ({item.count}제)
                              </span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-400 font-bold ml-2 px-1 cursor-pointer"
                                onClick={() => {
                                  const next = olympusItems.filter(
                                    (it) => it.id !== item.id,
                                  );
                                  setOlympusItems(next);
                                  void handleRefreshPreview(textbook, {
                                    olympusItems: next,
                                  });
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Blacklabel picker if textbook === 'blacklabel-middle-2-2' || textbook === 'blacklabel-middle-3-1' */}
                  {(textbook === 'blacklabel-middle-2-2' ||
                    textbook === 'blacklabel-middle-3-1') && (
                    <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-3.5 mb-3.5 shadow-lg">
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 mb-3 border-b border-white/10">
                        <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                          🏷️ 블랙라벨 단원·단계 선택기
                        </span>
                        <span className="text-xs text-slate-400">
                          {textbook === 'blacklabel-middle-3-1'
                            ? '단원과 단계를 고르고 번호를 추가하세요'
                            : '대단원/소단원/단계를 고르고 번호를 추가하세요'}
                        </span>
                      </div>

                      {textbook === 'blacklabel-middle-3-1' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                          <div className="sm:col-span-2">
                            <label
                              htmlFor="bl-chapter-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단원
                            </label>
                            <select
                              id="bl-chapter-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={blacklabelChapter}
                              onChange={(e) => {
                                const newCh = e.target.value;
                                setBlacklabelChapter(newCh);
                                setBlacklabelSubunit(newCh);
                                const stages = blacklabel31Hierarchy[newCh]?.[
                                  newCh
                                ] || ['Step1', 'Step2', 'Step3', 'Step4'];
                                setBlacklabelStage(stages[0] || 'Step1');
                              }}
                            >
                              {Object.keys(blacklabel31Hierarchy).map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="bl-stage-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단계(난이도)
                            </label>
                            <select
                              id="bl-stage-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={blacklabelStage}
                              onChange={(e) =>
                                setBlacklabelStage(e.target.value)
                              }
                            >
                              {['Step1', 'Step2', 'Step3', 'Step4'].map(
                                (stg) => (
                                  <option key={stg} value={stg}>
                                    {stg}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                          <div>
                            <label
                              htmlFor="bl-chapter-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              대단원
                            </label>
                            <select
                              id="bl-chapter-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={blacklabelChapter}
                              onChange={(e) => {
                                const newCh = e.target.value;
                                setBlacklabelChapter(newCh);
                                const subs = Object.keys(
                                  blacklabelHierarchy[newCh] || {},
                                );
                                const firstSub = subs[0] || '';
                                setBlacklabelSubunit(firstSub);
                                const stages =
                                  blacklabelHierarchy[newCh]?.[firstSub] || [];
                                setBlacklabelStage(stages[0] || '');
                              }}
                            >
                              {Object.keys(blacklabelHierarchy).map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="bl-subunit-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              소단원
                            </label>
                            <select
                              id="bl-subunit-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={blacklabelSubunit}
                              onChange={(e) => {
                                const newSub = e.target.value;
                                setBlacklabelSubunit(newSub);
                                const stages =
                                  blacklabelHierarchy[blacklabelChapter]?.[
                                    newSub
                                  ] || [];
                                setBlacklabelStage(stages[0] || '');
                              }}
                            >
                              {Object.keys(
                                blacklabelHierarchy[blacklabelChapter] || {},
                              ).map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="bl-stage-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단계(난이도)
                            </label>
                            <select
                              id="bl-stage-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={blacklabelStage}
                              onChange={(e) =>
                                setBlacklabelStage(e.target.value)
                              }
                            >
                              {(
                                blacklabelHierarchy[blacklabelChapter]?.[
                                  blacklabelSubunit
                                ] || []
                              ).map((stg) => (
                                <option key={stg} value={stg}>
                                  {stg}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-lg border border-white/5">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="block text-xs font-bold text-purple-400">
                              {textbook === 'blacklabel-middle-3-1'
                                ? `${blacklabelChapter.replace(/_/g, ' ')} · ${blacklabelStage}`
                                : `${blacklabelSubunit} · ${blacklabelStage}`}
                            </span>
                            {currentBlacklabelRange && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                💡 제공 문항: {currentBlacklabelRange.min} ~{' '}
                                {currentBlacklabelRange.max}번 (
                                {currentBlacklabelRange.count}문제)
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-purple-500 rounded-lg text-slate-100 placeholder-slate-500 text-xs outline-none"
                            placeholder={
                              currentBlacklabelRange
                                ? `번호 입력 (제공: ${currentBlacklabelRange.min}~${currentBlacklabelRange.max}번, 예: ${currentBlacklabelRange.min}-${Math.min(currentBlacklabelRange.min + 2, currentBlacklabelRange.max)})`
                                : '번호 입력 (예: 1-5 또는 1, 2, 3)'
                            }
                            value={blacklabelQuickInput}
                            onChange={(e) =>
                              setBlacklabelQuickInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddBlacklabelQuick();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-3.5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg shadow shrink-0 self-end transition-all cursor-pointer"
                          onClick={handleAddBlacklabelQuick}
                        >
                          + 문항 추가
                        </button>
                      </div>

                      {blacklabelItems.length > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {blacklabelItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs bg-slate-900/90 border border-slate-800 rounded px-3 py-2"
                            >
                              <span className="text-slate-200">
                                <span className="text-purple-400 font-semibold">
                                  [
                                  {textbook === 'blacklabel-middle-3-1'
                                    ? item.chapter.replace(/_/g, ' ')
                                    : item.subunit}
                                  ]
                                </span>{' '}
                                {item.stage} :{' '}
                                <span className="font-mono text-emerald-400 font-bold">
                                  {item.numbers}
                                </span>{' '}
                                ({item.count}제)
                              </span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-400 font-bold ml-2 px-1 cursor-pointer"
                                onClick={() => {
                                  const next = blacklabelItems.filter(
                                    (it) => it.id !== item.id,
                                  );
                                  setBlacklabelItems(next);
                                  void handleRefreshPreview(textbook, {
                                    blacklabelItems: next,
                                  });
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Concept picker if textbook === 'concept-middle-2-2' || textbook === 'concept-middle-3-1' */}
                  {(textbook === 'concept-middle-2-2' ||
                    textbook === 'concept-middle-3-1') && (
                    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 mb-3.5 shadow-lg">
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 mb-3 border-b border-white/10">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          ▲ 개념유형파워 단원·단계 선택기
                        </span>
                        <span className="text-xs text-slate-400">
                          {textbook === 'concept-middle-3-1'
                            ? '단원과 단계를 고르고 번호를 추가하세요'
                            : '대단원/소단원/단계를 고르고 번호를 추가하세요'}
                        </span>
                      </div>

                      {textbook === 'concept-middle-3-1' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                          <div className="sm:col-span-2">
                            <label
                              htmlFor="cp-chapter-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단원
                            </label>
                            <select
                              id="cp-chapter-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={conceptChapter}
                              onChange={(e) => {
                                const newCh = e.target.value;
                                setConceptChapter(newCh);
                                setConceptSubunit(newCh);
                                const stages = concept31Hierarchy[newCh]?.[
                                  newCh
                                ] || ['유형별', '단원마무리'];
                                setConceptStage(stages[0] || '유형별');
                              }}
                            >
                              {Object.keys(concept31Hierarchy).map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="cp-stage-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단계(유형)
                            </label>
                            <select
                              id="cp-stage-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={conceptStage}
                              onChange={(e) => setConceptStage(e.target.value)}
                            >
                              {['유형별', '단원마무리'].map((stg) => (
                                <option key={stg} value={stg}>
                                  {stg}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                          <div>
                            <label
                              htmlFor="cp-chapter-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              대단원
                            </label>
                            <select
                              id="cp-chapter-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={conceptChapter}
                              onChange={(e) => {
                                const newCh = e.target.value;
                                setConceptChapter(newCh);
                                const subs = Object.keys(
                                  conceptHierarchy[newCh] || {},
                                );
                                const firstSub = subs[0] || '';
                                setConceptSubunit(firstSub);
                                const stages =
                                  conceptHierarchy[newCh]?.[firstSub] || [];
                                setConceptStage(stages[0] || '');
                              }}
                            >
                              {Object.keys(conceptHierarchy).map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="cp-subunit-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              소단원
                            </label>
                            <select
                              id="cp-subunit-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={conceptSubunit}
                              onChange={(e) => {
                                const newSub = e.target.value;
                                setConceptSubunit(newSub);
                                const stages =
                                  conceptHierarchy[conceptChapter]?.[newSub] ||
                                  [];
                                setConceptStage(stages[0] || '');
                              }}
                            >
                              {Object.keys(
                                conceptHierarchy[conceptChapter] || {},
                              ).map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="cp-stage-select"
                              className="block text-xs font-semibold text-slate-400 mb-1"
                            >
                              단계(유형)
                            </label>
                            <select
                              id="cp-stage-select"
                              className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer"
                              value={conceptStage}
                              onChange={(e) => setConceptStage(e.target.value)}
                            >
                              {(
                                conceptHierarchy[conceptChapter]?.[
                                  conceptSubunit
                                ] || []
                              ).map((stg) => (
                                <option key={stg} value={stg}>
                                  {stg.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-lg border border-white/5">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="block text-xs font-bold text-emerald-400">
                              {textbook === 'concept-middle-3-1'
                                ? `${conceptChapter.replace(/_/g, ' ')} · ${conceptStage.replace(/_/g, ' ')}`
                                : `${conceptSubunit.replace(/_/g, ' ')} · ${conceptStage.replace(/_/g, ' ')}`}
                            </span>
                            {currentConceptRange && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                💡 제공 문항: {currentConceptRange.min} ~{' '}
                                {currentConceptRange.max}번 (
                                {currentConceptRange.count}문제)
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-emerald-500 rounded-lg text-slate-100 placeholder-slate-500 text-xs outline-none"
                            placeholder={
                              currentConceptRange
                                ? `번호 입력 (제공: ${currentConceptRange.min}~${currentConceptRange.max}번, 예: ${currentConceptRange.min}-${Math.min(currentConceptRange.min + 2, currentConceptRange.max)})`
                                : '번호 입력 (예: 1-5 또는 1, 2, 3)'
                            }
                            value={conceptQuickInput}
                            onChange={(e) =>
                              setConceptQuickInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddConceptQuick();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow shrink-0 self-end transition-all cursor-pointer"
                          onClick={handleAddConceptQuick}
                        >
                          + 문항 추가
                        </button>
                      </div>

                      {conceptItems.length > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {conceptItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs bg-slate-900/90 border border-slate-800 rounded px-3 py-2"
                            >
                              <span className="text-slate-200">
                                <span className="text-emerald-400 font-semibold">
                                  [
                                  {textbook === 'concept-middle-3-1'
                                    ? item.chapter.replace(/_/g, ' ')
                                    : item.subunit.replace(/_/g, ' ')}
                                  ]
                                </span>{' '}
                                {item.stage.replace(/_/g, ' ')} :{' '}
                                <span className="font-mono text-emerald-400 font-bold">
                                  {item.numbers}
                                </span>{' '}
                                ({item.count}제)
                              </span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-400 font-bold ml-2 px-1 cursor-pointer"
                                onClick={() => {
                                  const next = conceptItems.filter(
                                    (it) => it.id !== item.id,
                                  );
                                  setConceptItems(next);
                                  void handleRefreshPreview(textbook, {
                                    conceptItems: next,
                                  });
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Basic Ssen picker if textbook === 'basic-ssen-middle-2-2' */}
                  {textbook === 'basic-ssen-middle-2-2' && (
                    <div className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-3.5 mb-3.5 shadow-lg">
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 mb-3 border-b border-white/10">
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                          ▲ 베이직쎈 단원·단계 선택기
                        </span>
                        <span className="text-xs text-slate-400">
                          대단원/소단원/단계를 고르고 번호를 추가하세요
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mb-3">
                        <div className="sm:col-span-3">
                          <label
                            htmlFor="bs-chapter-select"
                            className="block text-xs font-semibold text-slate-400 mb-1"
                          >
                            대단원
                          </label>
                          <select
                            id="bs-chapter-select"
                            title={basicSsenChapter}
                            className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer truncate"
                            value={basicSsenChapter}
                            onChange={(e) => {
                              const newCh = e.target.value;
                              setBasicSsenChapter(newCh);
                              const subs = Object.keys(
                                basicSsenHierarchy[newCh] || {},
                              );
                              const firstSub = subs[0] || '';
                              setBasicSsenSubunit(firstSub);
                              const stages =
                                basicSsenHierarchy[newCh]?.[firstSub] || [];
                              setBasicSsenStage(stages[0] || '');
                            }}
                          >
                            {Object.keys(basicSsenHierarchy).map((ch) => (
                              <option key={ch} value={ch}>
                                {ch}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-4">
                          <label
                            htmlFor="bs-subunit-select"
                            className="block text-xs font-semibold text-slate-400 mb-1"
                          >
                            소단원
                          </label>
                          <select
                            id="bs-subunit-select"
                            title={basicSsenSubunit}
                            className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer truncate"
                            value={basicSsenSubunit}
                            onChange={(e) => {
                              const newSub = e.target.value;
                              setBasicSsenSubunit(newSub);
                              const stages =
                                basicSsenHierarchy[basicSsenChapter]?.[newSub] ||
                                [];
                              setBasicSsenStage(stages[0] || '');
                            }}
                          >
                            {Object.keys(
                              basicSsenHierarchy[basicSsenChapter] || {},
                            ).map((sub) => (
                              <option key={sub} value={sub}>
                                {sub}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-5">
                          <label
                            htmlFor="bs-stage-select"
                            className="block text-xs font-semibold text-slate-400 mb-1"
                          >
                            단계(유형)
                          </label>
                          <select
                            id="bs-stage-select"
                            title={basicSsenStage}
                            className="w-full px-2.5 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 text-xs outline-none cursor-pointer truncate"
                            value={basicSsenStage}
                            onChange={(e) => setBasicSsenStage(e.target.value)}
                          >
                            {(
                              basicSsenHierarchy[basicSsenChapter]?.[
                                basicSsenSubunit
                              ] || []
                            ).map((stg) => (
                              <option key={stg} value={stg}>
                                {stg}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 문항 번호 입력 및 액션 버튼 행 */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-slate-950/70 rounded-xl border border-white/10">
                        <div className="flex-1">
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[#0F1118] border border-[#242938] focus:border-sky-500 rounded-lg text-slate-100 placeholder-slate-500 text-xs outline-none font-mono"
                            placeholder={
                              currentBasicSsenRange
                                ? `문제 번호 입력 (제공: ${currentBasicSsenRange.min}~${currentBasicSsenRange.max}번 / 예: 1-5 또는 1, 3, 5)`
                                : '예: 1-5 또는 1, 3, 5'
                            }
                            value={basicSsenQuickInput}
                            onChange={(e) =>
                              setBasicSsenQuickInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addBasicSsenItem();
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            className="px-2.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg border border-slate-700 transition-all cursor-pointer"
                            onClick={() => {
                              if (!currentBasicSsenRange) return;
                              const max10 = Math.min(10, currentBasicSsenRange.max);
                              setBasicSsenQuickInput(`1-${max10}`);
                            }}
                          >
                            1~10번
                          </button>
                          <button
                            type="button"
                            className="px-2.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg border border-slate-700 transition-all cursor-pointer"
                            onClick={() => {
                              if (!currentBasicSsenRange) return;
                              setBasicSsenQuickInput(
                                `1-${currentBasicSsenRange.max}`,
                              );
                            }}
                          >
                            전체
                          </button>
                          <button
                            type="button"
                            className="px-3.5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 active:scale-95 text-white rounded-lg shadow shrink-0 transition-all cursor-pointer"
                            onClick={addBasicSsenItem}
                          >
                            + 문항 추가
                          </button>
                        </div>
                      </div>

                      {basicSsenItems.length > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {basicSsenItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/40 rounded-lg px-3 py-2 transition-all"
                            >
                              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                                <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-500/30 font-semibold text-[11px] shrink-0">
                                  {item.subunit}
                                </span>
                                <span className="text-slate-300 font-medium truncate">
                                  {item.stage.replace('자신감 ', '')}
                                </span>
                                <span className="text-slate-500 font-bold">:</span>
                                <span className="font-mono text-sky-300 font-bold bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                  {item.numbers}번
                                </span>
                                <span className="text-slate-400 text-[11px]">
                                  ({item.count}제)
                                </span>
                              </div>
                              <button
                                type="button"
                                title="삭제"
                                className="text-slate-400 hover:text-red-400 font-bold ml-2 px-1 cursor-pointer shrink-0"
                                onClick={() => {
                                  const next = basicSsenItems.filter(
                                    (it) => it.id !== item.id,
                                  );
                                  setBasicSsenItems(next);
                                  void handleRefreshPreview(textbook, {
                                    basicSsenItems: next,
                                  });
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Standard problem input for Synergy, Ssen & Gojaengi */}
                  {textbook !== 'olympus-calculus' &&
                    textbook !== 'blacklabel-middle-2-2' &&
                    textbook !== 'blacklabel-middle-3-1' &&
                    textbook !== 'concept-middle-2-2' &&
                    textbook !== 'concept-middle-3-1' &&
                    textbook !== 'basic-ssen-middle-2-2' && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label
                              htmlFor="hs-problem-numbers"
                              className="text-xs font-semibold text-slate-300"
                            >
                              {textbook === 'ssen-middle-3-1'
                                ? '문제 번호 입력 (쎈 3-1: 50 ~ 1398번 문항 제공)'
                                : textbook === 'ssen-middle-2-2'
                                  ? '문제 번호 입력 (쎈 2-2: 21 ~ 1142번 문항 제공)'
                                  : '문제 번호 입력 (쉼표, 범위 지원)'}
                            </label>
                            <span className="text-xs text-slate-400">
                              {textbook === 'ssen-common-math-1' ? (
                                <>
                                  예:{' '}
                                  <code className="bg-slate-800 text-sky-300 px-1 py-0.5 rounded">
                                    40, 42, 65
                                  </code>
                                </>
                              ) : textbook === 'ssen-middle-3-1' ? (
                                <>
                                  예:{' '}
                                  <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded">
                                    50-58
                                  </code>
                                  ,{' '}
                                  <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded">
                                    50, 65, 120
                                  </code>
                                </>
                              ) : textbook === 'ssen-middle-2-2' ? (
                                <>
                                  예:{' '}
                                  <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded">
                                    21-28
                                  </code>
                                  ,{' '}
                                  <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded">
                                    21, 25, 30
                                  </code>
                                </>
                              ) : (
                                <>
                                  예:{' '}
                                  <code className="bg-slate-800 text-blue-300 px-1 py-0.5 rounded">
                                    1-8
                                  </code>
                                  ,{' '}
                                  <code className="bg-slate-800 text-blue-300 px-1 py-0.5 rounded">
                                    1, 3, 5-10
                                  </code>
                                </>
                              )}
                            </span>
                          </div>
                          <textarea
                            id="hs-problem-numbers"
                            className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-slate-100 font-mono text-sm outline-none transition-all"
                            rows={2}
                            placeholder={
                              textbook === 'ssen-common-math-1'
                                ? '40-48'
                                : textbook === 'ssen-middle-3-1'
                                  ? '50-58'
                                  : textbook === 'ssen-middle-2-2'
                                    ? '21-28'
                                    : '1-8'
                            }
                            value={numbers}
                            onChange={(e) => setNumbers(e.target.value)}
                          />
                        </div>

                        <div className="mt-2.5 flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2a1912] hover:bg-[#4d2c20] border border-[#4a3023] hover:border-[#63c5ae] rounded-lg text-[11px] font-semibold text-[#d8c5b6] hover:text-white transition-all cursor-pointer"
                            onClick={handleSortNumbers}
                          >
                            <ArrowDownAZ className="size-3.5" /> 번호 오름차순
                            정렬
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2a1912] hover:bg-[#4d2c20] border border-[#8b563d] hover:border-[#e08a5b] rounded-lg text-[11px] font-semibold text-[#e08a5b] hover:text-[#f0c1a6] transition-all cursor-pointer"
                            onClick={() => setNumbers('')}
                          >
                            <Trash2 className="size-3.5" /> 번호 전체 비우기
                          </button>
                        </div>

                        {/* Selected problem numbers */}
                        {parsedProblemNumbers.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 max-h-36 overflow-y-auto px-1 py-1 text-sm text-[#d8c5b6]">
                            {parsedProblemNumbers.map((num) => (
                              <span
                                key={num}
                                className="inline-flex items-center gap-1 font-medium"
                              >
                                No. {num}
                                <button
                                  type="button"
                                  className="text-[#8d7d6c] hover:text-[#e08a5b] font-bold cursor-pointer"
                                  onClick={() => handleRemoveTag(num)}
                                  aria-label={`문항 ${num} 삭제`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                </div>
              </div>

              {/* Step 4: 상세 양식 & 표지 설정 (아코디언) */}
              <div className="bg-[#151822] border border-[#242938] border-l-4 border-l-amber-500 rounded-xl shadow-md overflow-hidden">
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between border-b border-[#242938] bg-white/[0.015] text-left cursor-pointer select-none"
                  onClick={() => setOptionsCollapsed(!optionsCollapsed)}
                  aria-label="상세 양식 및 표지 설정 토글"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="size-5.5 rounded-full flex items-center justify-center text-xs font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      4
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      상세 양식 & 표지 설정
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      서식·표지 옵션
                    </span>
                    <span className="text-xs text-amber-400 font-bold">
                      {optionsCollapsed ? '▼ 접기' : '▲ 펼치기'}
                    </span>
                  </div>
                </button>
                {optionsCollapsed && (
                  <div className="p-4 border-t border-slate-800/80 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="cover-title-input"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          표지 메인 제목
                        </label>
                        <input
                          id="cover-title-input"
                          type="text"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg text-slate-100 text-sm outline-none"
                          value={currentCoverTitle}
                          onChange={(e) => setCoverTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="academy-name-input"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          학원/기관명 (바닥글)
                        </label>
                        <input
                          id="academy-name-input"
                          type="text"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg text-slate-100 text-sm outline-none"
                          value={academyName}
                          onChange={(e) => setAcademyName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="cover-subtitle-input"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          표지 부제목
                        </label>
                        <input
                          id="cover-subtitle-input"
                          type="text"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg text-slate-100 text-sm outline-none"
                          value={coverSubtitle}
                          onChange={(e) => setCoverSubtitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="test-date-input"
                          className="block text-xs font-semibold text-slate-400 mb-1.5"
                        >
                          출제 일자
                        </label>
                        <input
                          id="test-date-input"
                          type="text"
                          className="w-full px-3.5 py-2.5 bg-[#0F1118] border border-[#242938] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg text-slate-100 text-sm outline-none"
                          value={testDate}
                          onChange={(e) => setTestDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="pt-2.5 border-t border-slate-800/80 space-y-3">
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                          <input
                            type="checkbox"
                            className="size-4 rounded accent-blue-600"
                            checked={includeCover}
                            onChange={(e) => setIncludeCover(e.target.checked)}
                          />
                          <span className="font-semibold">
                            표지(Cover) 페이지 포함
                          </span>
                        </label>

                        {includeCover && (
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                            <input
                              type="checkbox"
                              className="size-4 rounded accent-blue-600"
                              checked={includeCharacter}
                              onChange={(e) =>
                                setIncludeCharacter(e.target.checked)
                              }
                            />
                            <span>표지 중앙 로고/마스코트 표시</span>
                          </label>
                        )}
                      </div>

                      {includeCover && includeCharacter && (
                        <div className="p-3.5 bg-[#0D1017] border border-[#242938] rounded-xl flex items-center gap-4">
                          <div className="relative size-16 shrink-0 rounded-full border-2 border-slate-600/50 bg-slate-900/40 overflow-hidden flex items-center justify-center shadow-inner">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={customCharacter || defaultLogoSrc}
                              alt="표지 로고"
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-200">
                                표지 중앙 로고 / 마스코트
                              </span>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400">
                                {customCharacter
                                  ? '커스텀 로고 적용 중'
                                  : isMiddleDepartment
                                    ? '중등부 기본 로고 적용 중'
                                    : '고등부 기본 마스코트 적용 중'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {isMiddleDepartment
                                ? '중등부 기본 로고(다산미래학원)가 표지 상단 원형 엠블럼 중앙에 인쇄됩니다.'
                                : '고등부 기본 마스코트가 표지 상단 원형 엠블럼 중앙에 인쇄됩니다.'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <label
                                htmlFor="character-upload-input"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 bg-[#1F2433] hover:bg-[#2B3247] border border-[#30384F] hover:border-slate-500 transition-colors cursor-pointer"
                              >
                                <Upload className="size-3.5" />
                                <span>다른 로고/이미지로 변경</span>
                              </label>
                              <input
                                id="character-upload-input"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleCharacterUpload}
                              />
                              {customCharacter && (
                                <button
                                  type="button"
                                  onClick={handleResetCharacter}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="size-3" />
                                  기본값 복원
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <small className="block text-xs text-slate-400">
                        ※ 표지 중앙 &quot;{currentCoverTitle}&quot; / 하단 학생
                        이름 / 2×2 문제 배열 / 바닥글 {academyName} 적용
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="generator-actions flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-[#1B1E2B] hover:bg-[#2d1b12] border border-[#4a3023] hover:border-[#63c5ae] text-[#d8c5b6] hover:text-white transition-all cursor-pointer disabled:opacity-50"
                  onClick={() => void handleRefreshPreview()}
                  disabled={previewLoading || busy}
                >
                  <RefreshCw
                    className={`size-3.5 ${previewLoading ? 'animate-spin' : ''}`}
                  />
                  미리보기 갱신
                </button>

                <button
                  type="button"
                  className="flex-[2] min-w-[210px] flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-extrabold text-[#160d09] bg-[#63c5ae] hover:bg-[#8bd8c4] border border-[#9be0ce] shadow-lg shadow-[#63c5ae]/20 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer disabled:opacity-50"
                  onClick={() => void handleDownloadPdf()}
                  disabled={busy || previewLoading}
                >
                  <FileDown className="size-4" />
                  <span>
                    {busy
                      ? '생성 중…'
                      : studentMode === 'batch' &&
                          parsedBatchStudentNames.length > 1
                        ? `📦 ${parsedBatchStudentNames.length}명 일괄 생성 (ZIP 압축)`
                        : 'PDF 생성 및 다운로드'}
                  </span>
                </button>

                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-sm font-extrabold bg-[#c58b32] hover:bg-[#e0aa4f] border border-[#f2c66d] text-[#160d09] hover:text-[#160d09] transition-all cursor-pointer disabled:opacity-50"
                  onClick={handlePrintPdf}
                  disabled={previewLoading}
                >
                  <Printer className="size-3.5" />
                  바로 인쇄
                </button>
              </div>

              {/* Status banner */}
              {status && (
                <div className="p-3 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                  📢 {status}
                </div>
              )}
            </section>

            {/* Right Preview Panel */}
            <section
              className={`bg-[#151822] border border-[#242938] rounded-xl shadow-xl flex flex-col p-4 sm:p-5 sticky top-6 transition-all duration-200 ${
                previewExpanded
                  ? 'min-h-[1180px]'
                  : 'min-h-[960px] xl:min-h-[1020px]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between pb-3.5 mb-3.5 border-b border-[#242938] gap-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-100">
                    실시간 오답노트 미리보기
                  </h3>
                  {studentMode === 'batch' &&
                    parsedBatchStudentNames.length > 0 && (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                        1번 학생 ({parsedBatchStudentNames[0]}) 미리보기
                      </span>
                    )}
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
                    {previewLoading
                      ? '생성 중…'
                      : previewPdfUrl
                        ? '최신 반영됨'
                        : '입력 대기 중'}
                  </span>
                  {highSchoolProblemCount > 0 && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      총 {highSchoolProblemCount}문항 ({highSchoolPageCount}
                      페이지)
                    </span>
                  )}
                </div>

                {previewPdfUrl && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="inline-flex items-center rounded-full bg-[#151923] border border-[#30384F] overflow-hidden">
                      <button type="button" onClick={() => setPreviewPage((page) => Math.max(1, page - 1))} disabled={previewPage <= 1} className="p-2.5 text-slate-300 hover:bg-[#242A3A] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" aria-label="이전 페이지">
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="min-w-14 text-center text-sm font-bold text-slate-200">{previewPage}/{Math.max(1, highSchoolPageCount)}</span>
                      <button type="button" onClick={() => setPreviewPage((page) => Math.min(Math.max(1, highSchoolPageCount), page + 1))} disabled={previewPage >= Math.max(1, highSchoolPageCount)} className="p-2.5 text-slate-300 hover:bg-[#242A3A] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" aria-label="다음 페이지">
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                    {/* View Mode Toggle: Fit vs FitH */}
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewViewMode((prev) =>
                          prev === 'Fit' ? 'FitH' : 'Fit',
                        )
                      }
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#1F2433] hover:bg-[#2A3245] border border-[#30384F] text-slate-300 hover:text-white transition-all cursor-pointer"
                      title={
                        previewViewMode === 'Fit'
                          ? '가로폭에 맞추어 확대'
                          : 'A4 전체 페이지 한눈에 맞춤'
                      }
                    >
                      {previewViewMode === 'Fit'
                        ? '🔍 가로폭 확대'
                        : '📄 전체 맞춤'}
                    </button>

                    {/* Expand Height Toggle */}
                    <button
                      type="button"
                      onClick={() => setPreviewExpanded((prev) => !prev)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#1F2433] hover:bg-[#2A3245] border border-[#30384F] text-slate-300 hover:text-white transition-all cursor-pointer"
                      title={
                        previewExpanded
                          ? '기본 높이로 복원'
                          : '미리보기 창 대형 확대'
                      }
                    >
                      {previewExpanded ? '창 기본 크기' : '⤢ 창 대형 확대'}
                    </button>

                    {/* Open in New Window */}
                    <button
                      type="button"
                      onClick={() => window.open(previewPdfUrl, '_blank')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-blue-200 transition-all cursor-pointer"
                      title="새 창에서 원본 크기로 전체화면 보기"
                    >
                      <ExternalLink className="size-3.5" />
                      <span>새 창으로 크게 보기</span>
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`flex-1 bg-[#090A0E] border border-[#1C202E] rounded-lg overflow-hidden flex flex-col items-center justify-center relative transition-all duration-200 ${
                  previewExpanded
                    ? 'min-h-[1100px]'
                    : 'min-h-[900px] xl:min-h-[960px]'
                }`}
              >
                {previewLoading && (
                  <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-[#6bcbb5]/35 bg-[#10201d]/90 px-3 py-2 text-xs font-semibold text-[#a7c8c0] shadow-lg backdrop-blur-sm">
                    <span className="size-3 animate-spin rounded-full border-2 border-[#6bcbb5]/25 border-t-[#6bcbb5]" />
                    미리보기 갱신 중
                  </div>
                )}

                {previewPdfUrl ? (
                  <iframe
                    key={`${previewPdfUrl}-${previewViewMode}-${previewPage}`}
                    src={`${previewPdfUrl}#toolbar=0&navpanes=0&view=${previewViewMode}&page=${previewPage}`}
                    title="오답노트 실시간 미리보기"
                    className="w-full h-full rounded-lg border-0 bg-white shadow-2xl transition-all"
                    style={{ minHeight: previewExpanded ? '1100px' : '960px' }}
                  />
                ) : (
                  <div className="flex min-h-[900px] w-full items-center justify-center bg-[#100904] p-8 text-center">
                    <div className="flex h-[760px] w-full max-w-[540px] flex-col items-center justify-center rounded-[2rem] border border-[#e8e8e8] bg-[#2d1a12] px-8 shadow-2xl">
                      <div className="mb-8 flex size-44 items-center justify-center rounded-full border border-[#e8e8e8] bg-[#30483f]">
                        <img
                          src={isMiddleDepartment ? '/middle-logo.png' : '/character.png'}
                          alt="표지 캐릭터"
                          className="max-h-36 max-w-36 object-contain"
                        />
                      </div>
                      <h4 className="text-2xl font-black tracking-tight text-white">
                        {currentTb?.title} 오답노트
                      </h4>
                      <p className="mt-2 text-sm font-semibold text-[#f4dfd2]">
                        {coverSubtitle || '학생 맞춤형 오답 클리닉 & 실전 평가'}
                      </p>
                      <div className="mt-8 w-full rounded-xl border border-[#e8e8e8] bg-[#101514] p-4 text-left text-sm">
                        <div className="flex justify-between text-[#8bb5a8]">
                          <span>학생 성명</span>
                          <strong className="text-white">{student || '학생'}</strong>
                        </div>
                        <div className="mt-2 flex justify-between text-[#789b92]">
                          <span>학년</span>
                          <strong className="text-white">{grade}</strong>
                        </div>
                        <div className="mt-2 flex justify-between text-[#789b92]">
                          <span>선택 문항</span>
                          <strong className="text-[#63c9ae]">{highSchoolProblemCount}문제</strong>
                        </div>
                        <div className="mt-2 flex justify-between text-[#789b92]">
                          <span>출제 일자</span>
                          <strong className="text-white">{testDate}</strong>
                        </div>
                      </div>
                      <p className="mt-8 text-xs tracking-[0.2em] text-[#8bb5a8]">
                        {academyName}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <main
      className={`min-h-screen px-4 py-5 sm:px-7 sm:py-7 ${
        !textbook ? 'selection-canvas' : ''
      }`}
    >
      <div className="mx-auto max-w-6xl">
        <header
          className={`mb-6 flex items-center justify-between px-5 py-4 ${
            !textbook
              ? 'selection-header border-b border-dashed border-[#40372e] bg-transparent text-[#ffedd7]'
              : 'login-header rounded-2xl border bg-white/90 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <Image
              src="/dasan-mirae-logo.png"
              alt="다산미래학원 로고"
              width={48}
              height={48}
              priority
              className="size-12 shrink-0 rounded-full"
            />
            <div>
              <p
                className={`login-header-academy ${!textbook ? 'text-[#dc5000]' : 'text-primary'}`}
              >
                다산미래학원
              </p>
              <h1 className="login-header-title text-xl font-bold tracking-tight">
                <span className="login-header-title-accent">
                  {sessionToken ? '온라인 오답노트 만들기' : '온라인 오답노트'}
                </span>
              </h1>
              {!sessionToken && (
                <span className="login-header-caption">
                  PERSONALIZED REVIEW SYSTEM
                </span>
              )}
            </div>
          </div>
          {sessionToken ? (
            <Button
              type="button"
              variant="outline"
              onClick={logout}
              disabled={busy}
              className={!textbook ? 'ghost-pill' : undefined}
            >
              <LogOut /> 로그아웃
            </Button>
          ) : (
            <span className="rounded-full border border-[#40372e] bg-[#2a1912] px-3 py-1 text-xs font-semibold text-[#f5bd7b]">
              {configured ? '시험 운영' : '연결 준비'}
            </span>
          )}
        </header>

        {checkingSession ? (
          <Card className="mx-auto max-w-md border-0 shadow-lg">
            <CardContent
              className="py-12 text-center text-slate-600"
              aria-live="polite"
            >
              로그인 상태를 확인하고 있습니다…
            </CardContent>
          </Card>
        ) : !sessionToken ? (
          <section className="login-stage">
            <div className="login-intro">
              <div className="login-kicker">
                <span /> DASAN MIRAE ACADEMY
              </div>
              <h2 className="login-headline">
                <span className="login-headline-line1">
                  필요한 문제만 골라서
                </span>
                <span className="login-headline-line2">오답노트 만들기</span>
              </h2>

              <div className="login-features">
                <div className="login-feature-item login-feature-speed">
                  <div className="login-feature-badge">01</div>
                  <div className="login-feature-icon">
                    <Zap />
                  </div>
                  <div className="login-feature-text">
                    <div className="login-feature-title-wrap">
                      <strong className="login-feature-title">
                        초고속 맞춤 제작
                      </strong>
                      <span className="login-feature-tag">3초 완성</span>
                    </div>
                  </div>
                </div>
                <div className="login-feature-item login-feature-books">
                  <div className="login-feature-badge">02</div>
                  <div className="login-feature-icon">
                    <BookOpen />
                  </div>
                  <div className="login-feature-text">
                    <div className="login-feature-title-wrap">
                      <strong className="login-feature-title">
                        중고등 다수 교재 완비
                      </strong>
                      <span className="login-feature-tag">전 문항 DB</span>
                    </div>
                  </div>
                </div>
                <div className="login-feature-item login-feature-print">
                  <div className="login-feature-badge">03</div>
                  <div className="login-feature-icon">
                    <FileDown />
                  </div>
                  <div className="login-feature-text">
                    <div className="login-feature-title-wrap">
                      <strong className="login-feature-title">
                        출력 전용 고화질 PDF
                      </strong>
                      <span className="login-feature-tag">원클릭 인쇄</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="login-intro-rule" />
              <span className="login-intro-caption">
                SMART REVIEW · SIMPLE PRACTICE
              </span>
            </div>
            <Card className="login-card">
              <CardHeader className="login-card-header">
                <div className="login-lock">
                  <LockKeyhole />
                </div>
                <div className="login-card-eyebrow">MEMBER ACCESS</div>
                <CardTitle className="text-2xl">반가워요</CardTitle>
                <CardDescription>
                  관리자에게 받은 계정으로 로그인해 주세요.
                </CardDescription>
              </CardHeader>
              <CardContent className="login-card-content">
                <form className="space-y-4" onSubmit={login}>
                  <label htmlFor="login-id" className="block space-y-2">
                    <span className="font-medium">
                      아이디 <small>USERNAME</small>
                    </span>
                    <Input
                      id="login-id"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      autoComplete="username"
                      disabled={!configured || Boolean(sessionToken)}
                    />
                  </label>
                  <label htmlFor="login-password" className="block space-y-2">
                    <span className="font-medium">
                      비밀번호 <small>PASSWORD</small>
                    </span>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={!configured || Boolean(sessionToken)}
                    />
                  </label>
                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={!configured || busy}
                  >
                    {busy ? '확인 중…' : '로그인'}
                  </Button>
                  <p
                    aria-live="polite"
                    className="login-status rounded-xl p-3 text-sm leading-6"
                  >
                    {status}
                  </p>
                </form>
                {!configured && (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    현재는 안전하게 연결값을 비워 둔 로컬 준비 상태입니다. 배포
                    전에 Supabase 환경 설정을 연결합니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        ) : !department ? (
          <section className="department-stage mx-auto max-w-5xl">
            <div className="selection-grid">
              <button
                type="button"
                onClick={() => {
                  setDepartment('middle');
                  setTextbook(null);
                  setStatus('중등부 교재를 선택해 주세요.');
                }}
                className="editorial-choice editorial-choice-middle group"
              >
                <span className="choice-index">01</span>
                <School className="choice-icon" />
                <div className="choice-footer">
                  <div>
                    <h3>중등부</h3>
                    <p>MIDDLE SCHOOL</p>
                  </div>
                  <span className="choice-status">
                    {
                      textbooks.filter((item) => item.department === 'middle')
                        .length
                    }{' '}
                    BOOKS
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDepartment('high');
                  setTextbook(null);
                  setStatus('고등부 교재를 선택해 주세요.');
                }}
                className="editorial-choice editorial-choice-high group"
              >
                <span className="choice-index">02</span>
                <GraduationCap className="choice-icon" />
                <div className="choice-footer">
                  <div>
                    <h3>고등부</h3>
                    <p>HIGH SCHOOL</p>
                  </div>
                  <span className="choice-status">
                    {
                      textbooks.filter((item) => item.department === 'high')
                        .length
                    }{' '}
                    BOOKS
                  </span>
                </div>
              </button>
            </div>
          </section>
        ) : !textbook ? (
          <section className="textbook-stage mx-auto max-w-5xl">
            <div className="mb-3 flex flex-col gap-3 border-b border-dashed border-[#40372e] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="selection-kicker">
                  {department === 'middle'
                    ? '01 / MIDDLE SCHOOL'
                    : '02 / HIGH SCHOOL'}
                </p>
                <p className="selection-copy mt-3">
                  오답노트를 만들 교재를 선택하면 전용 입력 화면이 열립니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDepartment(null)}
                className="ghost-pill"
              >
                첫 화면으로
              </button>
            </div>
            <div className="textbook-list">
              {(() => {
                const deptItems = textbooks.filter(
                  (item) => item.department === department,
                );
                return deptItems.map((item, index) => {
                  const meta = getTextbookGroupMeta(item);
                  const prevMeta =
                    index > 0 ? getTextbookGroupMeta(deptItems[index - 1]) : null;
                  const showHeading =
                    index === 0 || meta.key !== prevMeta?.key;

                  return (
                    <div key={item.id} className="textbook-entry">
                      {showHeading ? (
                        <div
                          className={`textbook-semester-heading ${meta.headerClass}`}
                        >
                          <span>{meta.title}</span>
                          <span>{meta.subtitle}</span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.available) {
                            setStatus(
                              `${item.title}는 아직 준비 중인 교재입니다.`,
                            );
                            return;
                          }
                          selectTextbook(item.id);
                          setStatus('학생 정보와 문제번호를 입력하세요.');
                        }}
                        className={`textbook-row group ${meta.rowClass}`}
                      >
                        <span className="textbook-index">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <BookOpen className="textbook-icon" />
                        <div className="min-w-0 flex-1">
                          <h3 className="textbook-name-line">
                            {item.title}{' '}
                            <span className="textbook-subject">
                              {item.subject}
                            </span>
                          </h3>
                        </div>
                        <span className="textbook-action">
                          {item.available ? '선택 →' : '준비 중'}
                        </span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        ) : (
          <section className="mx-auto max-w-3xl">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {textbooks.find((item) => item.id === textbook)?.title}{' '}
                      오답노트
                    </CardTitle>
                    <CardDescription className="mt-1">
                      학생 정보와 틀린 문제를 입력하세요.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDepartment(
                        department === 'middle' ? 'high' : 'middle',
                      );
                      setTextbook(null);
                      setPreviewPdfUrl(null);
                    }}
                  >
                    {department === 'middle'
                      ? '고등부 교재 바로가기'
                      : '중등부 교재 바로가기'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form className="grid gap-5 sm:grid-cols-2" onSubmit={generate}>
                  <label htmlFor="student" className="space-y-2">
                    <span className="font-medium">학생 이름</span>
                    <Input
                      id="student"
                      value={student}
                      onChange={(e) => setStudent(e.target.value)}
                      placeholder="홍길동"
                      required
                      disabled={!sessionToken}
                    />
                  </label>
                  <label htmlFor="grade" className="space-y-2">
                    <span className="font-medium">학년</span>
                    <NativeSelect
                      id="grade"
                      className="w-full"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      disabled={!sessionToken}
                    >
                      <NativeSelectOption>1학년</NativeSelectOption>
                      <NativeSelectOption>2학년</NativeSelectOption>
                      <NativeSelectOption>3학년</NativeSelectOption>
                    </NativeSelect>
                  </label>
                  {textbook === 'olympus-calculus' && (
                    <>
                      <label htmlFor="olympus-unit" className="space-y-2">
                        <span className="font-medium">단원</span>
                        <NativeSelect
                          id="olympus-unit"
                          className="w-full"
                          value={olympusUnit}
                          onChange={(e) => setOlympusUnit(e.target.value)}
                        >
                          {olympusUnits.map((unit) => (
                            <NativeSelectOption key={unit}>
                              {unit}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="olympus-type" className="space-y-2">
                        <span className="font-medium">문제유형</span>
                        <NativeSelect
                          id="olympus-type"
                          className="w-full"
                          value={olympusType}
                          onChange={(e) => setOlympusType(e.target.value)}
                        >
                          <NativeSelectOption>유형완성하기</NativeSelectOption>
                          <NativeSelectOption>
                            서술형완성하기
                          </NativeSelectOption>
                          <NativeSelectOption>고난도도전</NativeSelectOption>
                        </NativeSelect>
                      </label>
                    </>
                  )}
                  {textbook === 'blacklabel-middle-3-1' ? (
                    <>
                      <label htmlFor="blacklabel-chapter" className="space-y-2">
                        <span className="font-medium">단원</span>
                        <NativeSelect
                          id="blacklabel-chapter"
                          className="w-full"
                          value={blacklabelChapter}
                          onChange={(e) => {
                            const newCh = e.target.value;
                            setBlacklabelChapter(newCh);
                            setBlacklabelSubunit(newCh);
                            const stages = blacklabel31Hierarchy[newCh]?.[
                              newCh
                            ] || ['Step1', 'Step2', 'Step3', 'Step4'];
                            setBlacklabelStage(stages[0] || 'Step1');
                          }}
                        >
                          {Object.keys(blacklabel31Hierarchy).map((ch) => (
                            <NativeSelectOption key={ch} value={ch}>
                              {ch.replace(/_/g, ' ')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="blacklabel-stage" className="space-y-2">
                        <span className="font-medium">단계(난이도)</span>
                        <NativeSelect
                          id="blacklabel-stage"
                          className="w-full"
                          value={blacklabelStage}
                          onChange={(e) => setBlacklabelStage(e.target.value)}
                        >
                          {['Step1', 'Step2', 'Step3', 'Step4'].map((stg) => (
                            <NativeSelectOption key={stg} value={stg}>
                              {stg}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : textbook === 'blacklabel-middle-2-2' ? (
                    <>
                      <label htmlFor="blacklabel-chapter" className="space-y-2">
                        <span className="font-medium">대단원</span>
                        <NativeSelect
                          id="blacklabel-chapter"
                          className="w-full"
                          value={blacklabelChapter}
                          onChange={(e) => {
                            const newCh = e.target.value;
                            setBlacklabelChapter(newCh);
                            const subs = Object.keys(
                              blacklabelHierarchy[newCh] || {},
                            );
                            const firstSub = subs[0] || '';
                            setBlacklabelSubunit(firstSub);
                            const stages =
                              blacklabelHierarchy[newCh]?.[firstSub] || [];
                            setBlacklabelStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(blacklabelHierarchy).map((ch) => (
                            <NativeSelectOption key={ch} value={ch}>
                              {ch}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="blacklabel-subunit" className="space-y-2">
                        <span className="font-medium">소단원</span>
                        <NativeSelect
                          id="blacklabel-subunit"
                          className="w-full"
                          value={blacklabelSubunit}
                          onChange={(e) => {
                            const newSub = e.target.value;
                            setBlacklabelSubunit(newSub);
                            const stages =
                              blacklabelHierarchy[blacklabelChapter]?.[
                                newSub
                              ] || [];
                            setBlacklabelStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(
                            blacklabelHierarchy[blacklabelChapter] || {},
                          ).map((sub) => (
                            <NativeSelectOption key={sub} value={sub}>
                              {sub}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label
                        htmlFor="blacklabel-stage"
                        className="space-y-2 sm:col-span-2"
                      >
                        <span className="font-medium">단계(난이도)</span>
                        <NativeSelect
                          id="blacklabel-stage"
                          className="w-full"
                          value={blacklabelStage}
                          onChange={(e) => setBlacklabelStage(e.target.value)}
                        >
                          {(
                            blacklabelHierarchy[blacklabelChapter]?.[
                              blacklabelSubunit
                            ] || []
                          ).map((stg) => (
                            <NativeSelectOption key={stg} value={stg}>
                              {stg}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : null}
                  {textbook === 'concept-middle-3-1' ? (
                    <>
                      <label htmlFor="concept-chapter" className="space-y-2">
                        <span className="font-medium">단원</span>
                        <NativeSelect
                          id="concept-chapter"
                          className="w-full"
                          value={conceptChapter}
                          onChange={(e) => {
                            const newCh = e.target.value;
                            setConceptChapter(newCh);
                            setConceptSubunit(newCh);
                            const stages = concept31Hierarchy[newCh]?.[
                              newCh
                            ] || ['유형별', '단원마무리'];
                            setConceptStage(stages[0] || '유형별');
                          }}
                        >
                          {Object.keys(concept31Hierarchy).map((ch) => (
                            <NativeSelectOption key={ch} value={ch}>
                              {ch.replace(/_/g, ' ')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="concept-stage" className="space-y-2">
                        <span className="font-medium">단계(유형)</span>
                        <NativeSelect
                          id="concept-stage"
                          className="w-full"
                          value={conceptStage}
                          onChange={(e) => setConceptStage(e.target.value)}
                        >
                          {['유형별', '단원마무리'].map((stg) => (
                            <NativeSelectOption key={stg} value={stg}>
                              {stg}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : textbook === 'concept-middle-2-2' ? (
                    <>
                      <label htmlFor="concept-chapter" className="space-y-2">
                        <span className="font-medium">대단원</span>
                        <NativeSelect
                          id="concept-chapter"
                          className="w-full"
                          value={conceptChapter}
                          onChange={(e) => {
                            const newCh = e.target.value;
                            setConceptChapter(newCh);
                            const subs = Object.keys(
                              conceptHierarchy[newCh] || {},
                            );
                            const firstSub = subs[0] || '';
                            setConceptSubunit(firstSub);
                            const stages =
                              conceptHierarchy[newCh]?.[firstSub] || [];
                            setConceptStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(conceptHierarchy).map((ch) => (
                            <NativeSelectOption key={ch} value={ch}>
                              {ch.replace(/_/g, ' ')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="concept-subunit" className="space-y-2">
                        <span className="font-medium">소단원</span>
                        <NativeSelect
                          id="concept-subunit"
                          className="w-full"
                          value={conceptSubunit}
                          onChange={(e) => {
                            const newSub = e.target.value;
                            setConceptSubunit(newSub);
                            const stages =
                              conceptHierarchy[conceptChapter]?.[newSub] || [];
                            setConceptStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(
                            conceptHierarchy[conceptChapter] || {},
                          ).map((sub) => (
                            <NativeSelectOption key={sub} value={sub}>
                              {sub.replace(/_/g, ' ')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label
                        htmlFor="concept-stage"
                        className="space-y-2 sm:col-span-2"
                      >
                        <span className="font-medium">단계(유형)</span>
                        <NativeSelect
                          id="concept-stage"
                          className="w-full"
                          value={conceptStage}
                          onChange={(e) => setConceptStage(e.target.value)}
                        >
                          {(
                            conceptHierarchy[conceptChapter]?.[
                              conceptSubunit
                            ] || []
                          ).map((stg) => (
                            <NativeSelectOption key={stg} value={stg}>
                              {stg.replace(/_/g, ' ')}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : textbook === 'basic-ssen-middle-2-2' ? (
                    <>
                      <label htmlFor="basic-ssen-chapter" className="space-y-2">
                        <span className="font-medium">대단원</span>
                        <NativeSelect
                          id="basic-ssen-chapter"
                          className="w-full"
                          value={basicSsenChapter}
                          onChange={(e) => {
                            const newCh = e.target.value;
                            setBasicSsenChapter(newCh);
                            const subs = Object.keys(
                              basicSsenHierarchy[newCh] || {},
                            );
                            const firstSub = subs[0] || '';
                            setBasicSsenSubunit(firstSub);
                            const stages =
                              basicSsenHierarchy[newCh]?.[firstSub] || [];
                            setBasicSsenStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(basicSsenHierarchy).map((ch) => (
                            <NativeSelectOption key={ch} value={ch}>
                              {ch}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label htmlFor="basic-ssen-subunit" className="space-y-2">
                        <span className="font-medium">소단원</span>
                        <NativeSelect
                          id="basic-ssen-subunit"
                          className="w-full"
                          value={basicSsenSubunit}
                          onChange={(e) => {
                            const newSub = e.target.value;
                            setBasicSsenSubunit(newSub);
                            const stages =
                              basicSsenHierarchy[basicSsenChapter]?.[newSub] || [];
                            setBasicSsenStage(stages[0] || '');
                          }}
                        >
                          {Object.keys(
                            basicSsenHierarchy[basicSsenChapter] || {},
                          ).map((sub) => (
                            <NativeSelectOption key={sub} value={sub}>
                              {sub}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                      <label
                        htmlFor="basic-ssen-stage"
                        className="space-y-2 sm:col-span-2"
                      >
                        <span className="font-medium">단계(유형)</span>
                        <NativeSelect
                          id="basic-ssen-stage"
                          className="w-full"
                          value={basicSsenStage}
                          onChange={(e) => setBasicSsenStage(e.target.value)}
                        >
                          {(
                            basicSsenHierarchy[basicSsenChapter]?.[
                              basicSsenSubunit
                            ] || []
                          ).map((stg) => (
                            <NativeSelectOption key={stg} value={stg}>
                              {stg}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </>
                  ) : null}
                  <label htmlFor="numbers" className="space-y-2 sm:col-span-2">
                    <span className="font-medium">문제번호</span>
                    <Textarea
                      id="numbers"
                      value={numbers}
                      onChange={(e) => setNumbers(e.target.value)}
                      placeholder={
                        textbook === 'blacklabel-middle-2-2' ||
                        textbook === 'blacklabel-middle-3-1' ||
                        textbook === 'concept-middle-2-2' ||
                        textbook === 'concept-middle-3-1' ||
                        textbook === 'basic-ssen-middle-2-2'
                          ? '1, 2, 3 또는 1~5'
                          : '1, 5, 10 또는 1-10'
                      }
                      required={
                        textbook !== 'olympus-calculus' &&
                        textbook !== 'blacklabel-middle-2-2' &&
                        textbook !== 'blacklabel-middle-3-1' &&
                        textbook !== 'concept-middle-2-2' &&
                        textbook !== 'concept-middle-3-1' &&
                        textbook !== 'basic-ssen-middle-2-2'
                      }
                      disabled={!sessionToken}
                    />
                    <span className="block text-sm text-muted-foreground">
                      {textbook === 'olympus-calculus' ||
                      textbook === 'blacklabel-middle-2-2' ||
                      textbook === 'blacklabel-middle-3-1' ||
                      textbook === 'concept-middle-2-2' ||
                      textbook === 'concept-middle-3-1' ||
                      textbook === 'basic-ssen-middle-2-2'
                        ? '선택한 단원과 단계 안에서 표시된 번호를 입력 후 [목록에 추가]를 누르세요.'
                        : '쉼표·띄어쓰기·연속 범위를 사용할 수 있습니다. 한 번에 최대 100문제입니다.'}
                    </span>
                  </label>
                  {textbook === 'olympus-calculus' && (
                    <div className="space-y-3 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={addOlympusItem}
                        disabled={busy}
                      >
                        목록에 추가
                      </Button>
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">입력한 문제 목록</p>
                            <p className="text-sm text-slate-500">
                              총{' '}
                              {olympusItems.reduce(
                                (total, item) => total + item.count,
                                0,
                              )}{' '}
                              / 100문제
                            </p>
                          </div>
                          {olympusItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setOlympusItems([]);
                                setStatus('입력 목록을 모두 비웠습니다.');
                              }}
                            >
                              전체 비우기
                            </Button>
                          )}
                        </div>
                        {olympusItems.length === 0 ? (
                          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">
                            단원과 문제유형을 선택하고 번호를 목록에 추가하세요.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {olympusItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
                              >
                                <span>
                                  {index + 1}. {item.unit} · {item.problemType}{' '}
                                  · {item.numbers}번
                                  <span className="ml-2 text-slate-500">
                                    ({item.count}문제)
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setOlympusItems((items) =>
                                      items.filter(
                                        (entry) => entry.id !== item.id,
                                      ),
                                    )
                                  }
                                >
                                  삭제
                                </Button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                  {(textbook === 'blacklabel-middle-2-2' ||
                    textbook === 'blacklabel-middle-3-1') && (
                    <div className="space-y-3 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={addBlacklabelItem}
                        disabled={busy}
                      >
                        목록에 추가
                      </Button>
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">입력한 문제 목록</p>
                            <p className="text-sm text-slate-500">
                              총{' '}
                              {blacklabelItems.reduce(
                                (total, item) => total + item.count,
                                0,
                              )}{' '}
                              / 100문제
                            </p>
                          </div>
                          {blacklabelItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setBlacklabelItems([]);
                                setStatus('입력 목록을 모두 비웠습니다.');
                              }}
                            >
                              전체 비우기
                            </Button>
                          )}
                        </div>
                        {blacklabelItems.length === 0 ? (
                          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">
                            단원과 단계를 선택하고 번호를 목록에 추가하세요.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {blacklabelItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
                              >
                                <span>
                                  {index + 1}. [
                                  {textbook === 'blacklabel-middle-3-1'
                                    ? item.chapter.replace(/_/g, ' ')
                                    : `${item.chapter} > ${item.subunit}`}
                                  ] {item.stage} · {item.numbers}번
                                  <span className="ml-2 text-slate-500">
                                    ({item.count}문제)
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setBlacklabelItems((items) =>
                                      items.filter(
                                        (entry) => entry.id !== item.id,
                                      ),
                                    )
                                  }
                                >
                                  삭제
                                </Button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                  {(textbook === 'concept-middle-2-2' ||
                    textbook === 'concept-middle-3-1') && (
                    <div className="space-y-3 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={addConceptItem}
                        disabled={busy}
                      >
                        목록에 추가
                      </Button>
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">입력한 문제 목록</p>
                            <p className="text-sm text-slate-500">
                              총{' '}
                              {conceptItems.reduce(
                                (total, item) => total + item.count,
                                0,
                              )}{' '}
                              / 100문제
                            </p>
                          </div>
                          {conceptItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setConceptItems([]);
                                setStatus('입력 목록을 모두 비웠습니다.');
                              }}
                            >
                              전체 비우기
                            </Button>
                          )}
                        </div>
                        {conceptItems.length === 0 ? (
                          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">
                            단원과 단계를 선택하고 번호를 목록에 추가하세요.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {conceptItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
                              >
                                <span>
                                  {index + 1}. [
                                  {textbook === 'concept-middle-3-1'
                                    ? item.chapter.replace(/_/g, ' ')
                                    : `${item.chapter.replace(/_/g, ' ')} > ${item.subunit.replace(/_/g, ' ')}`}
                                  ] {item.stage.replace(/_/g, ' ')} ·{' '}
                                  {item.numbers}번
                                  <span className="ml-2 text-slate-500">
                                    ({item.count}문제)
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setConceptItems((items) =>
                                      items.filter(
                                        (entry) => entry.id !== item.id,
                                      ),
                                    )
                                  }
                                >
                                  삭제
                                </Button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                  {textbook === 'basic-ssen-middle-2-2' && (
                    <div className="space-y-3 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={addBasicSsenItem}
                        disabled={busy}
                      >
                        목록에 추가
                      </Button>
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">입력한 문제 목록</p>
                            <p className="text-sm text-slate-500">
                              총{' '}
                              {basicSsenItems.reduce(
                                (total, item) => total + item.count,
                                0,
                              )}{' '}
                              / 100문제
                            </p>
                          </div>
                          {basicSsenItems.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setBasicSsenItems([]);
                                setStatus('입력 목록을 모두 비웠습니다.');
                              }}
                            >
                              전체 비우기
                            </Button>
                          )}
                        </div>
                        {basicSsenItems.length === 0 ? (
                          <p className="rounded-lg bg-white p-3 text-sm text-slate-500">
                            단원과 단계를 선택하고 번호를 목록에 추가하세요.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {basicSsenItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm"
                              >
                                <span>
                                  {index + 1}. [{item.subunit}] {item.stage.replace('자신감 ', '')} ·{' '}
                                  {item.numbers}번
                                  <span className="ml-2 text-slate-500">
                                    ({item.count}문제)
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setBasicSsenItems((items) =>
                                      items.filter(
                                        (entry) => entry.id !== item.id,
                                      ),
                                    )
                                  }
                                >
                                  삭제
                                </Button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                  {!textbooks.find((item) => item.id === textbook)
                    ?.available && (
                    <p className="sm:col-span-2 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                      전용 입력 화면은 준비되었습니다. 실제 PDF 생성은 이 교재의
                      문제 이미지와 빠른정답을 온라인 저장소에 연결한 뒤 사용할
                      수 있습니다.
                    </p>
                  )}
                  <div className="sm:col-span-2 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      aria-live="polite"
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <CheckCircle2 className="size-4 text-primary" />
                      {status}
                    </p>
                    <Button
                      type="submit"
                      className="h-11 px-5"
                      disabled={
                        !sessionToken ||
                        busy ||
                        !textbooks.find((item) => item.id === textbook)
                          ?.available
                      }
                    >
                      <FileDown /> {busy ? '만드는 중…' : 'PDF 만들기'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
