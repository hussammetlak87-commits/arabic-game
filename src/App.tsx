import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type ChallengeKind = "choice" | "route" | "order" | "sort" | "write";
type SortCard = { id: string; label: string; group: string };
type Challenge = {
  id: string;
  kind: ChallengeKind;
  prompt: string;
  detail?: string;
  hint: string;
  explanation: string;
  skill: string;
  options?: string[];
  answer?: number;
  fragments?: string[];
  order?: string[];
  groups?: string[];
  cards?: SortCard[];
  example?: string;
  validate?: (value: string) => boolean;
};
type Stage = {
  name: string;
  shortName: string;
  subtitle: string;
  gem: string;
  places: string[];
  hazards: { x: number; y: number }[];
  challenges: Challenge[];
};
type Feedback = { status: "wrong" | "correct" | "revealed"; text: string };
type Phase = "start" | "playing" | "challenge" | "paused" | "stageResult" | "results" | "gameover";
type RecordRow = { name: string; score: number; percent: number; date: string };
type SavedGame = {
  name: string;
  stageIndex: number;
  challengeIndex: number;
  phase: Phase;
  resumePhase?: Phase;
  runScore: number;
  questionScores: Record<string, number>;
  passedStages: boolean[];
  awardedStages: boolean[];
  health: number;
  feedback: Feedback | null;
  wrongCount: number;
  selectedOption: number | null;
  orderedPieces: string[];
  sortAssignments: Record<string, string>;
  typedAnswer: string;
};

const QUEST_CAP = 250;
const SAVE_KEY = "arena-tashbih-run-v1";
const RECORD_KEY = "arena-tashbih-records-v1";
const SOUND_KEY = "arena-tashbih-sound-v1";
const markerX = [18, 35, 52, 69, 86];
const markerY = [68, 57, 72, 56, 68];
const compareTool = /ك(?:ال|أنّ?|ـ)|مثل|يشبه|تشبه|كما/u;

const STAGES: Stage[] = [
  {
    name: "بوابة التشبيه",
    shortName: "بوابة الأركان",
    subtitle: "اجمع أركان الصورة البلاغية",
    gem: "جوهرة الأركان",
    places: ["قوس البداية", "ساحة الطرفين", "ممر الكلمات", "عين المعنى", "بوابة البيان"],
    hazards: [{ x: 47, y: 64 }, { x: 78, y: 63 }],
    challenges: [
      {
        id: "gate-1", kind: "choice",
        prompt: "في الجملة «العالِم كالنخلة في العطاء»، ما المشبّه؟",
        detail: "تأمّل الطرف الذي نريد أن نصفه ونقرّب صورته إلى الذهن.",
        options: ["العالِم", "النخلة", "الكاف", "العطاء"], answer: 0,
        hint: "المشبّه هو الطرف الذي نصفه، لا الصورة التي نقارنه بها.",
        explanation: "العالِم هو الطرف الذي نريد وصفه؛ لذلك يُسمّى المشبّه.", skill: "أركان التشبيه",
      },
      {
        id: "gate-2", kind: "order",
        prompt: "رتّب الكلمات لبناء تشبيه تامّ الأركان.",
        detail: "تأكّد من ترتيب المشبّه، ثم الأداة، فالمشبّه به ووجه الشبه.",
        fragments: ["في العذوبة", "كالماءِ", "صوتُ", "المؤذّنِ"],
        order: ["صوتُ", "المؤذّنِ", "كالماءِ", "في العذوبة"],
        hint: "ابدأ بالطرف الذي تصفه، واجعل أداة التشبيه قبل الصورة المقارَن بها.",
        explanation: "«صوت المؤذّن كالماء في العذوبة»: ظهر الطرفان والأداة ووجه الشبه.", skill: "تركيب التشبيه",
      },
      {
        id: "gate-3", kind: "sort",
        prompt: "ضع كل كلمة في ركنها الصحيح من التشبيه.",
        detail: "الجملة: «الشاعر كالطائر في الحرية». اسحب الكلمة أو المسها، ثم اختر موضعها.",
        groups: ["المشبّه", "أداة التشبيه", "المشبّه به", "وجه الشبه"],
        cards: [
          { id: "poet", label: "الشاعر", group: "المشبّه" },
          { id: "tool", label: "كـ", group: "أداة التشبيه" },
          { id: "bird", label: "الطائر", group: "المشبّه به" },
          { id: "face", label: "الحرية", group: "وجه الشبه" },
        ],
        hint: "«الشاعر» هو الموصوف، و«الطائر» الصورة التي نقرّبه إليها.",
        explanation: "تطابقت الكلمات مع أدوارها الأربعة: الشاعر، والكاف، والطائر، والحرية.", skill: "أركان التشبيه",
      },
      {
        id: "gate-4", kind: "choice",
        prompt: "ما وجه الشبه في قولنا: «صوتها كالنغم في الصفاء»؟",
        options: ["صوتها", "النغم", "الكاف", "الصفاء"], answer: 3,
        hint: "ابحث عن الصفة المشتركة التي تأتي غالبًا بعد «في».",
        explanation: "الصفاء صفة مشتركة بين الصوت والنغم، فهو وجه الشبه.", skill: "أركان التشبيه",
      },
      {
        id: "gate-5", kind: "route",
        prompt: "أيّ كلمة تؤدي وظيفة أداة التشبيه؟",
        detail: "«الخيّال كالنسر في علوّ الهمة». اختر الطريق الذي يشير إلى الأداة.",
        options: ["الخيّال", "الكاف في «كالنسر»", "النسر", "علوّ الهمة"], answer: 1,
        hint: "الأداة لفظ يدل على المشابهة، مثل الكاف أو «مثل» أو «كأنّ».",
        explanation: "الكاف في «كالنسر» هي أداة الربط التي تدلّ على المشابهة.", skill: "أركان التشبيه",
      },
    ],
  },
  {
    name: "واحة التشبيه المرسل",
    shortName: "واحة المرسل",
    subtitle: "اقتفِ أثر أداة التشبيه في الواحة",
    gem: "جوهرة الأداة",
    places: ["عين الغاف", "ممر النخيل", "بركة الصفاء", "درب السراب", "ظلّ الواحة"],
    hazards: [{ x: 45, y: 62 }, { x: 76, y: 60 }],
    challenges: [
      {
        id: "oasis-1", kind: "choice",
        prompt: "أيّ الجمل الآتية تشبيه مرسل؟",
        options: ["النهار كالكتاب المفتوح", "المتسابق برق", "الأمل ضوء", "ابتسمت الزهرة"], answer: 0,
        hint: "التشبيه المرسل هو ما ذُكرت فيه أداة التشبيه صراحةً.",
        explanation: "في «النهار كالكتاب المفتوح» ظهرت أداة التشبيه، وهي الكاف؛ لذلك فهو مرسل.", skill: "التشبيه المرسل",
      },
      {
        id: "oasis-2", kind: "sort",
        prompt: "صنّف الجمل بحسب ظهور أداة التشبيه.",
        detail: "التشبيه المرسل تَرِد فيه أداة مثل الكاف أو «مثل»؛ اسند كل مثال إلى بئره.",
        groups: ["مرسل", "غير مرسل"],
        cards: [
          { id: "a", label: "العلم كالنور في الهداية", group: "مرسل" },
          { id: "b", label: "الفتاة زهرة في الرقة", group: "غير مرسل" },
          { id: "c", label: "العامل مثل النحلة في النشاط", group: "مرسل" },
          { id: "d", label: "الوقت سيف", group: "غير مرسل" },
        ],
        hint: "فتّش عن لفظ يدل على المشابهة قبل أن تحكم.",
        explanation: "الجملتان اللتان تتضمنان «الكاف» أو «مثل» مرسلتان، والأخريان حُذفت منهما الأداة.", skill: "التشبيه المرسل",
      },
      {
        id: "oasis-3", kind: "order",
        prompt: "كوّن تشبيهًا مرسلًا يصف سرعة الفتى.",
        detail: "استعمل جميع الكلمات مرة واحدة.",
        fragments: ["في السرعة", "يركضُ", "كالريحِ", "الفتى"],
        order: ["يركضُ", "الفتى", "كالريحِ", "في السرعة"],
        hint: "أبقِ أداة التشبيه في الصورة؛ فهي العلامة التي نبحث عنها.",
        explanation: "«يركض الفتى كالريح في السرعة» تشبيه مرسل؛ لأن الكاف مذكورة.", skill: "تركيب التشبيه المرسل",
      },
      {
        id: "oasis-4", kind: "route",
        prompt: "أيّ مسار يجعل الجملة تشبيهًا مرسلًا؟",
        detail: "«الماء ... المرآة في الصفاء». أضف الأداة المناسبة.",
        options: ["الماء كالمرآة", "الماء مرآة", "الماء صافٍ", "الماء يلمع"], answer: 0,
        hint: "اختر تركيبًا يضم الطرفين وأداة ظاهرة بينهما.",
        explanation: "في «الماء كالمرآة» ظهرت الكاف أداةً للتشبيه، فصار مرسلًا.", skill: "التشبيه المرسل",
      },
      {
        id: "oasis-5", kind: "choice",
        prompt: "ما أداة التشبيه في: «كأنّ النجوم مصابيح في السماء»؟",
        options: ["النجوم", "كأنّ", "مصابيح", "السماء"], answer: 1,
        hint: "الأداة هنا كلمة واحدة تتقدم الطرفين وتدل على المشابهة.",
        explanation: "«كأنّ» أداة تشبيه صريحة، ووجودها يجعل التشبيه مرسلًا.", skill: "أدوات التشبيه",
      },
    ],
  },
  {
    name: "قلعة التشبيه المؤكّد",
    shortName: "قلعة المؤكّد",
    subtitle: "تسلّل إلى القلعة واكتشف الأداة المحذوفة",
    gem: "جوهرة التأكيد",
    places: ["الجسر الحجري", "برج الراية", "ساحة الحارس", "المكتبة القديمة", "قلب القلعة"],
    hazards: [{ x: 48, y: 61 }, { x: 79, y: 59 }],
    challenges: [
      {
        id: "fort-1", kind: "choice",
        prompt: "أيّ عبارة تتضمن تشبيهًا مؤكّدًا؟",
        options: ["المقاتل أسد في الشجاعة", "المقاتل كالأسد في الشجاعة", "المقاتل شجاع", "المقاتل مثل الأسد"], answer: 0,
        hint: "المؤكّد هو ما حُذفت منه أداة التشبيه، ولو بقي وجه الشبه.",
        explanation: "في «المقاتل أسد في الشجاعة» حُذفت الأداة وبقي وجه الشبه؛ فهو تشبيه مؤكّد.", skill: "التشبيه المؤكّد",
      },
      {
        id: "fort-2", kind: "sort",
        prompt: "صنّف الأمثلة: هل ذُكرت أداة التشبيه أم حُذفت؟",
        groups: ["مؤكّد: الأداة محذوفة", "مرسل: الأداة مذكورة"],
        cards: [
          { id: "a", label: "الطالب نجم في المثابرة", group: "مؤكّد: الأداة محذوفة" },
          { id: "b", label: "الجنود كالجبال في الثبات", group: "مرسل: الأداة مذكورة" },
          { id: "c", label: "الصبر زاد في الطريق", group: "مؤكّد: الأداة محذوفة" },
          { id: "d", label: "صوت الماء مثل الهمس", group: "مرسل: الأداة مذكورة" },
        ],
        hint: "وجود الكاف أو «مثل» يعني أن التشبيه مرسل، وحذفهما يعني أنه مؤكّد.",
        explanation: "ظهرت الأداة في مثالي الجنود وصوت الماء، وحُذفت في مثالي الطالب والصبر.", skill: "تمييز التشبيه المؤكّد",
      },
      {
        id: "fort-3", kind: "order",
        prompt: "أعِد بناء التشبيه المؤكّد من الكلمات المتناثرة.",
        detail: "«الجندي ... في الشجاعة». تذكّر: الأداة محذوفة.",
        fragments: ["في الشجاعة", "الجندي", "أسد"],
        order: ["الجندي", "أسد", "في الشجاعة"],
        hint: "لا تضع الكاف أو «مثل»؛ المطلوب حذف أداة التشبيه.",
        explanation: "«الجندي أسد في الشجاعة» تشبيه مؤكد؛ حُذفت الأداة وبقي وجه الشبه.", skill: "تركيب التشبيه المؤكّد",
      },
      {
        id: "fort-4", kind: "choice",
        prompt: "في «المعلّم منارة في هداية طلابه»، ما العنصر المحذوف؟",
        options: ["المشبّه", "المشبّه به", "أداة التشبيه", "وجه الشبه"], answer: 2,
        hint: "كلمة «منارة» باقية، ووجه الشبه «هداية طلابه» ظاهر أيضًا.",
        explanation: "المشبّه والمشبّه به ووجه الشبه ظاهرة، أما أداة التشبيه فقد حُذفت؛ لذلك هو مؤكّد.", skill: "تحليل التشبيه المؤكّد",
      },
      {
        id: "fort-5", kind: "route",
        prompt: "أيّ جملة حُذفت منها أداة التشبيه مع بقاء وجه الشبه؟",
        options: ["الحديقة كالجنة في الجمال", "الحديقة جنة في الجمال", "الحديقة جميلة", "في الحديقة أزهار"], answer: 1,
        hint: "اقرأ الجملة بحثًا عن الكاف أو «مثل»؛ لا ينبغي أن تجدهما في التشبيه المؤكّد.",
        explanation: "«الحديقة جنة في الجمال» بلا أداة، ووجه الشبه «الجمال» ما زال مذكورًا.", skill: "تمييز التشبيه المؤكّد",
      },
    ],
  },
  {
    name: "متاهة التشبيه البليغ",
    shortName: "متاهة البليغ",
    subtitle: "اختر الطريق إلى الصورة الأقوى والأوجز",
    gem: "جوهرة البلاغة",
    places: ["ممر الصدى", "متاهة الأقواس", "منصة الصورة", "جسر المعنى", "مخرج البيان"],
    hazards: [{ x: 47, y: 62 }, { x: 77, y: 61 }],
    challenges: [
      {
        id: "maze-1", kind: "route",
        prompt: "اختر التشبيه البليغ من بين الصور الآتية.",
        options: ["الجندي كالأسد في الإقدام", "الجندي أسد", "الجندي مثل الأسد", "الجندي شجاع"], answer: 1,
        hint: "التشبيه البليغ يحذف الأداة ووجه الشبه، ويُبقي الطرفين.",
        explanation: "«الجندي أسد» يذكر المشبّه والمشبّه به فقط، لذا فهو بليغ.", skill: "التشبيه البليغ",
      },
      {
        id: "maze-2", kind: "sort",
        prompt: "اهتدِ بين الأزقّة: أيّ الصور بليغة وأيّها ليست بليغة؟",
        groups: ["تشبيه بليغ", "ليس بليغًا"],
        cards: [
          { id: "a", label: "العلم نور", group: "تشبيه بليغ" },
          { id: "b", label: "وجه الطفل كالقمر", group: "ليس بليغًا" },
          { id: "c", label: "الأم بحر", group: "تشبيه بليغ" },
          { id: "d", label: "المجتهد مثل النحلة في النظام", group: "ليس بليغًا" },
        ],
        hint: "وجود الأداة أو ذكر وجه الشبه يجعل التشبيه غير بليغ.",
        explanation: "العلم نور، والأم بحر، صورتان بليغتان؛ لا تظهر فيهما أداة أو وجه شبه.", skill: "تمييز التشبيه البليغ",
      },
      {
        id: "maze-3", kind: "choice",
        prompt: "ما الأثر الأبرز لعبارة «الوقت سيف»؟",
        options: ["إطالة الوصف وتفصيله", "قوة الصورة وإيجازها", "تحديد وقت وقوع الحدث", "وصف لون السيف"], answer: 1,
        hint: "لاحظ أن الطرفين جُمِعا في تركيب قصير دون أداة أو شرح للصفة.",
        explanation: "التشبيه البليغ يضغط الصورة في عبارة موجزة، فيوحي بقوة الوقت وخطر إضاعته.", skill: "أثر التشبيه البليغ",
      },
      {
        id: "maze-4", kind: "order",
        prompt: "كوّن صورة بليغة تجعل الصديق نهرًا في العطاء.",
        detail: "احذف أداة التشبيه ووجه الشبه، واترك الطرفين فقط.",
        fragments: ["في العطاء", "الصديق", "نهر", "كـ"],
        order: ["الصديق", "نهر"],
        hint: "للبليغ طرفان فقط في هذا المثال؛ لا حاجة إلى الكاف أو العبارة التي تشرح الصفة.",
        explanation: "«الصديق نهر» تشبيه بليغ؛ حُذفت أداة التشبيه ووجه الشبه.", skill: "تركيب التشبيه البليغ",
      },
      {
        id: "maze-5", kind: "choice",
        prompt: "ما العنصران المحذوفان في «الحياة رحلة»؟",
        options: ["المشبّه والمشبّه به", "الأداة ووجه الشبه", "المشبّه والأداة", "وجه الشبه والمشبّه به"], answer: 1,
        hint: "كلمتا «الحياة» و«رحلة» ظاهرتان؛ تفحّص ما بينهما وما يشرح وجه المشاركة.",
        explanation: "ظهر الطرفان «الحياة» و«رحلة»، وحُذفت الأداة ووجه الشبه؛ لذا فالصورة بليغة.", skill: "تحليل التشبيه البليغ",
      },
    ],
  },
  {
    name: "مدينة البيان",
    shortName: "التحدّي النهائي",
    subtitle: "حلّل الصورة، ثم اصنع صورتك الخاصة",
    gem: "جوهرة البيان",
    places: ["محطة القوافي", "سوق المعاني", "منارة الصورة", "ميدان الكاتب", "قلب المدينة"],
    hazards: [{ x: 46, y: 64 }, { x: 78, y: 62 }],
    challenges: [
      {
        id: "final-1", kind: "choice",
        prompt: "حلّل: «القراءة كالمفتاح في اكتساب المعرفة». ما نوع التشبيه؟",
        options: ["مرسل لظهور الأداة", "مؤكّد لحذف الأداة", "بليغ لحذف الطرفين", "ليس تشبيهًا"], answer: 0,
        hint: "ابحث عن أداة ظاهرة تصل بين القراءة والمفتاح.",
        explanation: "الكاف ظاهرة في «كالمفتاح»، لذا فالتشبيه مرسل، ووجه الشبه مذكور أيضًا.", skill: "تحليل أنواع التشبيه",
      },
      {
        id: "final-2", kind: "choice",
        prompt: "في «الكتاب صديق»، ما المعنى الذي توحي به الصورة غالبًا؟",
        options: ["أن الكتاب يرافق القارئ وينفعه", "أن الكتاب يتحدث بصوت مرتفع", "أن الكتاب مصنوع من الماء", "أن الكتاب لا يُقرأ"], answer: 0,
        hint: "تخيّل الصفة التي تجمع الصديق بالكتاب، لا الصفة الحرفية.",
        explanation: "شُبّه الكتاب بالصديق للإيحاء بالمرافقة والنفع والألفة.", skill: "تفسير الصورة البلاغية",
      },
      {
        id: "final-3", kind: "order",
        prompt: "حوّل «العلم كالنور في الهداية» إلى تشبيه بليغ.",
        detail: "أبقِ المشبّه والمشبّه به فقط.",
        fragments: ["في الهداية", "نور", "العلم", "كالـ"],
        order: ["العلم", "نور"],
        hint: "للوصول إلى البليغ، احذف أداة التشبيه ووجه الشبه وأبقِ الطرفين.",
        explanation: "«العلم نور» تشبيه بليغ؛ بقي الطرفان وحُذفت الأداة ووجه الشبه.", skill: "تحويل التشبيه البليغ",
      },
      {
        id: "final-4", kind: "write",
        prompt: "اكتب تشبيهًا مرسلًا تصف فيه البحر بالاتساع، واذكر أداة التشبيه.",
        detail: "مثال مختلف عن إجابتك: «البحر كالفضاء في الاتساع». اكتب جملتك أنت.",
        example: "البحر كالفضاء في الاتساع.",
        validate: (value) => value.trim().length >= 12 && /(البحر|الموج|المحيط|الماء)/.test(value) && compareTool.test(value),
        hint: "اذكر البحر أو الموج، ثم أضف أداة ظاهرة مثل الكاف أو «مثل»، واجعل الصورة واضحة.",
        explanation: "جملتك من إنشائك؛ ظهور أداة التشبيه فيها يجعلها مرسلة. راجع وضوح الطرفين ووجه الشبه.", skill: "الكتابة الإبداعية: المرسل",
      },
      {
        id: "final-5", kind: "write",
        prompt: "اكتب تشبيهًا بليغًا يذكر «الوطن»، من دون أداة أو وجه شبه.",
        detail: "ابدأ بـ«الوطن ...». اذكر الطرفين مباشرةً، ولا تستخدم الكاف أو «مثل». ",
        example: "الوطن بيتُ الأمان.",
        validate: (value) => value.trim().length >= 12 && value.includes("الوطن") && !compareTool.test(value),
        hint: "اجعل الوطن طرفًا، وألحق به اسمًا يصنع صورة مباشرة مثل «بيت» أو «حضن».",
        explanation: "أحسنت صنع صورة من إنشائك؛ عندما يظهر الطرفان دون أداة أو وجه شبه يكون التشبيه بليغًا.", skill: "الكتابة الإبداعية: البليغ",
      },
    ],
  },
];

const emptyScores = (): Record<string, number> => ({});
const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

function SceneArtwork({ stageIndex }: { stageIndex: number }) {
  const skies = [
    ["#172742", "#ef9268"],
    ["#102b43", "#42a98d"],
    ["#14233a", "#d88359"],
    ["#1b2250", "#aa6c94"],
    ["#10243b", "#3fbbbd"],
  ];
  const ground = ["#a96648", "#3e7e66", "#a5684a", "#6e5875", "#3c827f"];
  const far = ["#7d5160", "#387568", "#70515c", "#4b4d79", "#326778"];
  const front = ["#cb8757", "#589273", "#bb815b", "#836686", "#479794"];
  const id = `landscape-${stageIndex}`;
  return (
    <svg className="scene-art" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={skies[stageIndex][0]} />
          <stop offset="68%" stopColor={skies[stageIndex][1]} />
          <stop offset="100%" stopColor={ground[stageIndex]} />
        </linearGradient>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff1ba" />
          <stop offset="100%" stopColor="#f5ac72" />
        </linearGradient>
        <linearGradient id={`${id}-path`} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#f5c886" stopOpacity=".58" />
          <stop offset="100%" stopColor="#f9db9d" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <rect width="1440" height="900" fill={`url(#${id}-sky)`} />
      <circle className="scene-sun" cx="1120" cy="232" r="89" fill={`url(#${id}-sun)`} />
      <circle cx="1120" cy="232" r="118" fill="#ffe6ab" opacity=".1" />
      <g className="scene-stars" fill="#ffe5bd">
        <circle cx="192" cy="131" r="2" /><circle cx="322" cy="202" r="2.5" />
        <circle cx="780" cy="119" r="2" /><circle cx="900" cy="197" r="2" />
        <circle cx="1258" cy="110" r="2.4" /><circle cx="1350" cy="299" r="1.7" />
      </g>
      <path d="M0 444 Q130 382 265 430T530 420T830 438T1120 414T1440 420V680H0Z" fill={far[stageIndex]} opacity=".56" />
      {stageIndex === 1 && <path d="M0 476 Q205 443 385 472T755 463T1114 470T1440 449V652H0Z" fill="#1e5658" opacity=".5" />}
      <g className="distant-architecture" fill="#293b50" opacity=".78">
        {stageIndex === 0 && (
          <g>
            <path d="M563 514V376h78V333h32v43h70V514h-49V424c0-39-29-67-64-67s-62 29-62 67v90z" />
            <path d="M514 514V409h46V375h27v34h32v105zM746 514V406h53v-37h27v37h47v108z" />
            <path d="M648 512V449c0-26 18-43 39-43s40 17 40 43v63z" fill="#d89972" opacity=".34" />
            <path d="M596 367h28m84 0h26m-190 37h30m229-2h29" stroke="#e7bf91" strokeWidth="6" opacity=".55" />
          </g>
        )}
        {stageIndex === 1 && (
          <g>
            <path d="M180 521q0-176 19-228m-18 55q-72-76-121-54 70 22 117 80m14-55q68-90 121-63-73 25-121 93m-4-42q-3-99 49-133-32 62-27 150" stroke="#33475a" strokeWidth="20" strokeLinecap="round" fill="none" />
            <path d="M1022 523q4-140 19-207m-17 54q-54-71-97-56 56 18 95 74m22-51q52-72 95-53-57 21-95 80" stroke="#344555" strokeWidth="16" strokeLinecap="round" fill="none" />
            <path d="M289 519h238q-12-80-63-80-30-53-83-10-61-24-92 90zm699 13h201q-12-72-51-69-35-52-71-13-61-20-79 82z" />
          </g>
        )}
        {stageIndex === 2 && (
          <g>
            <path d="M394 529V389h48v-31h33v31h69V334h35v55h82V352h40v-30h31v30h70v-57h37v57h65v-36h32v36h64v147z" />
            <path d="M434 529v-61a37 37 0 0 1 74 0v61m214 0v-76a41 41 0 0 1 82 0v76m164 0v-58a34 34 0 0 1 68 0v58" fill="#dd9b6e" opacity=".34" />
            <path d="M396 405h520" stroke="#e7be90" strokeWidth="7" opacity=".46" />
          </g>
        )}
        {stageIndex === 3 && (
          <g fill="none" stroke="#343d62" strokeWidth="23" opacity=".92">
            <path d="M116 499V414h176v85h136v-92h168v92h144v-98h148v98h136" />
            <path d="M228 526v-47h111v-63h114m216 105v-49h112v-70h150m97 124v-49h158" />
            <path d="M0 422h87v93m971-101h138v70h146" />
          </g>
        )}
        {stageIndex === 4 && (
          <g>
            <path d="M90 522V406h74v-81h31v81h67v116zm229 0V370h84v-66h31v66h52v152zm220 0V420h54v-98h32v98h82v102zm224 0V349h95v-76h34v76h66v173zm252 0V399h61v-99h31v99h106v123z" />
            <path d="M103 430h22m80 15h31m120-31h32m245 33h36m203-97h35m64 37h28m98 21h30" stroke="#84d6ca" strokeWidth="8" opacity=".65" />
          </g>
        )}
      </g>
      <path d="M0 535Q186 487 360 542T706 524T1040 548T1440 512V900H0Z" fill={ground[stageIndex]} />
      <path d="M0 605Q173 547 373 605T773 581T1121 614T1440 569V900H0Z" fill={far[stageIndex]} opacity=".34" />
      <path d="M0 693Q190 636 388 683T790 658T1164 688T1440 647V900H0Z" fill={front[stageIndex]} opacity=".58" />
      <path d="M-65 823C185 638 332 826 536 713S933 603 1134 731s272 99 404 9" fill="none" stroke={`url(#${id}-path)`} strokeWidth="90" opacity=".38" />
      <path className="scene-route" d="M-35 822C187 642 330 820 532 713S934 606 1130 733s269 98 385 10" fill="none" stroke="#ffe4af" strokeWidth="2" strokeDasharray="4 16" opacity=".24" />
      {stageIndex === 1 && <path className="waterline" d="M280 665q130-20 260 0t260 0" fill="none" stroke="#88ded0" strokeWidth="6" opacity=".46" />}
      <g className="foreground-grain" fill="#ffdb9c" opacity=".32">
        <circle cx="144" cy="729" r="3" /><circle cx="338" cy="779" r="2" />
        <circle cx="1228" cy="706" r="3" /><circle cx="1352" cy="779" r="2" />
        <circle cx="987" cy="799" r="2" /><circle cx="726" cy="767" r="2.5" />
      </g>
    </svg>
  );
}

function Explorer() {
  return (
    <svg viewBox="0 0 84 112" className="explorer-svg" aria-hidden="true">
      <defs>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#54d9c2" /><stop offset="1" stopColor="#168d91" />
        </linearGradient>
        <linearGradient id="scarf" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffcd8e" /><stop offset="1" stopColor="#ed8765" />
        </linearGradient>
        <linearGradient id="skin" x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor="#f8c69b" /><stop offset="1" stopColor="#d89072" />
        </linearGradient>
      </defs>
      <ellipse cx="42" cy="103" rx="26" ry="7" fill="#122534" opacity=".35" />
      <path d="M19 61q-9 9-7 28l8 7 9-8-1-20zm45 1q10 9 8 27l-8 8-9-8 1-20z" fill="#f5b986" />
      <path d="M22 66q1-17 20-17 21 0 21 17l-4 24H26z" fill="url(#coat)" />
      <path d="M32 52q1 8 10 10 8-2 11-10l-3-8H35z" fill="url(#skin)" />
      <path d="M26 26q1-19 17-19 18 0 20 20l-2 15q-8 8-18 8-10 0-17-10z" fill="url(#skin)" />
      <path d="M25 27q-2-22 18-22 19 0 21 21l-6-5q-13 1-24-5l-4 13z" fill="#202a39" />
      <path d="M28 22q12-12 31-1v7q-12-4-29 1z" fill="#f2e8d4" />
      <path d="M29 27q11-5 29 0" fill="none" stroke="#dba373" strokeWidth="2" />
      <ellipse cx="36" cy="34" rx="2" ry="2.4" fill="#263346" />
      <ellipse cx="52" cy="34" rx="2" ry="2.4" fill="#263346" />
      <path d="M40 43q4 3 8 0" fill="none" stroke="#a85858" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 69q-5 14 7 20l12-5-5-18z" fill="#278a8b" />
      <path d="M41 63q9 6 18-1l-4 33H42l-3-24z" fill="url(#scarf)" />
      <path d="M30 92h12l-1 12H27q-3-6 3-12zm15 0h13l7 12H46z" fill="#253447" />
      <path d="M23 57q-8 6-8 21" fill="none" stroke="#f8c890" strokeWidth="3" />
      <circle cx="14" cy="80" r="4" fill="#ffe297" />
      <path d="M15 84q-4 5 0 10" fill="none" stroke="#ffe297" strokeWidth="2" opacity=".8" />
    </svg>
  );
}

function GemIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 36" fill="none" aria-hidden="true">
      <path d="M8 3h16l7 9-15 21L1 12z" fill="currentColor" opacity=".22" />
      <path d="M8 3h16l7 9-15 21L1 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m8 3 1 9 7 21 7-21 1-9M1 12h30M9 12l7-9 7 9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("start");
  const [pauseFrom, setPauseFrom] = useState<Phase>("playing");
  const [nameDraft, setNameDraft] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [stageIndex, setStageIndex] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [questionScores, setQuestionScores] = useState<Record<string, number>>(emptyScores);
  const [passedStages, setPassedStages] = useState<boolean[]>([false, false, false, false, false]);
  const [awardedStages, setAwardedStages] = useState<boolean[]>([false, false, false, false, false]);
  const [health, setHealth] = useState(3);
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [orderedPieces, setOrderedPieces] = useState<string[]>([]);
  const [sortAssignments, setSortAssignments] = useState<Record<string, string>>({});
  const [sortSelected, setSortSelected] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [draftError, setDraftError] = useState("");
  const [nearStation, setNearStation] = useState(false);
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; tone: string }[]>([]);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => readStored(SOUND_KEY, true));
  const [leaderboard, setLeaderboard] = useState<RecordRow[]>(() => readStored(RECORD_KEY, []));
  const [savedRun, setSavedRun] = useState<SavedGame | null>(() => readStored<SavedGame | null>(SAVE_KEY, null));
  const soundEnabledRef = useRef(soundEnabled);

  const playerRef = useRef({ x: 12, y: 68 });
  const avatarRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("start");
  const stageRef = useRef(0);
  const questionRef = useRef(0);
  const nearRef = useRef(false);
  const heldKeys = useRef(new Set<string>());
  const interactRef = useRef<() => void>(() => undefined);
  const pauseRef = useRef<() => void>(() => undefined);
  const damageRef = useRef<() => void>(() => undefined);
  const lastHitRef = useRef(0);
  const healthRef = useRef(3);
  const feedbackRef = useRef<Feedback | null>(null);
  const wrongCountRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const noteRef = useRef(0);
  const burstIdRef = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const shakeTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const stage = STAGES[stageIndex];
  const challenge = stage.challenges[challengeIndex];
  const allQuestionPoints = Object.values(questionScores).reduce((sum, score) => sum + score, 0);
  const stageRewards = awardedStages.filter(Boolean).length * 10;
  const totalScore = allQuestionPoints + stageRewards;
  const successPercent = Math.round((allQuestionPoints / QUEST_CAP) * 100);
  const gemsCollected = awardedStages.filter(Boolean).length;
  const currentProgress = Math.round(((stageIndex * 5 + challengeIndex) / 25) * 100);
  const answeredInStage = challengeIndex + (feedback?.status === "correct" || feedback?.status === "revealed" ? 1 : 0);

  phaseRef.current = phase;
  stageRef.current = stageIndex;
  questionRef.current = challengeIndex;
  nearRef.current = nearStation;
  feedbackRef.current = feedback;
  wrongCountRef.current = wrongCount;
  soundEnabledRef.current = soundEnabled;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2100);
  }, []);

  const playTone = useCallback((frequency: number, duration = 0.18, volume = 0.055, waveform: OscillatorType = "sine") => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioRef.current) audioRef.current = new AudioContextClass();
      const context = audioRef.current;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.03);
    } catch {
      // Audio is optional on browsers that restrict Web Audio.
    }
  }, []);

  const playEffect = useCallback((kind: "correct" | "wrong" | "gem" | "hurt") => {
    if (kind === "correct") {
      playTone(587, 0.14, 0.045);
      window.setTimeout(() => playTone(784, 0.22, 0.05), 90);
    } else if (kind === "gem") {
      [523, 659, 784, 1046].forEach((note, index) => window.setTimeout(() => playTone(note, 0.5, 0.035), index * 100));
    } else if (kind === "wrong") {
      playTone(196, 0.19, 0.045, "triangle");
    } else {
      playTone(130, 0.27, 0.055, "sawtooth");
    }
  }, [playTone]);

  const startAmbience = useCallback(() => {
    if (!soundEnabledRef.current || musicTimerRef.current !== null) return;
    const notes = [220, 261.63, 293.66, 261.63, 196, 246.94];
    musicTimerRef.current = window.setInterval(() => {
      const note = notes[noteRef.current % notes.length];
      noteRef.current += 1;
      playTone(note, 1.05, 0.012, "sine");
    }, 1480);
  }, [playTone]);

  const stopAmbience = useCallback(() => {
    if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
    musicTimerRef.current = null;
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    try { localStorage.setItem(SOUND_KEY, JSON.stringify(next)); } catch { /* Local storage is optional. */ }
    if (next) {
      startAmbience();
      playTone(659, 0.15, 0.035);
    } else stopAmbience();
  };

  const emitBurst = useCallback((x: number, y: number, tone = "gold") => {
    const id = ++burstIdRef.current;
    setBursts((items) => [...items.slice(-4), { id, x, y, tone }]);
    window.setTimeout(() => setBursts((items) => items.filter((item) => item.id !== id)), 950);
  }, []);

  const rattle = useCallback(() => {
    setShake(false);
    window.requestAnimationFrame(() => setShake(true));
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 470);
  }, []);

  const setPlayerPosition = useCallback((x: number, y: number) => {
    playerRef.current = { x, y };
    if (avatarRef.current) {
      avatarRef.current.style.left = `${x}%`;
      avatarRef.current.style.top = `${y}%`;
    }
  }, []);

  const damagePlayer = useCallback(() => {
    const now = performance.now();
    if (now - lastHitRef.current < 1350 || phaseRef.current !== "playing") return;
    lastHitRef.current = now;
    rattle();
    playEffect("hurt");
    emitBurst(playerRef.current.x, playerRef.current.y, "violet");
    showToast("تجنّب شظايا العاصفة! خسرتَ درعًا واحدًا.");
    const remaining = Math.max(0, healthRef.current - 1);
    healthRef.current = remaining;
    setHealth(remaining);
    const push = playerRef.current.x < 50 ? -5 : 5;
    setPlayerPosition(Math.max(7, Math.min(93, playerRef.current.x + push)), Math.max(47, playerRef.current.y - 2));
    if (remaining === 0) {
      heldKeys.current.clear();
      window.setTimeout(() => setPhase("gameover"), 420);
    }
  }, [emitBurst, playEffect, rattle, setPlayerPosition, showToast]);
  damageRef.current = damagePlayer;

  const pauseGame = useCallback(() => {
    if (phaseRef.current === "playing" || phaseRef.current === "challenge") {
      setPauseFrom(phaseRef.current);
      setPhase("paused");
      heldKeys.current.clear();
    }
  }, []);
  pauseRef.current = pauseGame;

  const openCurrentChallenge = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (!nearRef.current) {
      showToast("اقترب من البلّورة المضيئة ثم تفاعل معها.");
      playTone(330, 0.1, 0.025);
      return;
    }
    setDraftError("");
    setPhase("challenge");
    playTone(523, 0.12, 0.035);
  }, [playTone, showToast]);
  interactRef.current = openCurrentChallenge;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.04);
      last = now;
      if (phaseRef.current === "playing") {
        let dx = 0;
        let dy = 0;
        const keys = heldKeys.current;
        if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
        if (keys.has("arrowright") || keys.has("d")) dx += 1;
        if (keys.has("arrowup") || keys.has("w")) dy -= 1;
        if (keys.has("arrowdown") || keys.has("s")) dy += 1;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        const moving = dx !== 0 || dy !== 0;
        if (moving) {
          const next = {
            x: Math.max(6, Math.min(94, playerRef.current.x + dx * 29 * delta)),
            y: Math.max(47, Math.min(82, playerRef.current.y + dy * 24 * delta)),
          };
          playerRef.current = next;
          if (avatarRef.current) {
            avatarRef.current.style.left = `${next.x}%`;
            avatarRef.current.style.top = `${next.y}%`;
            avatarRef.current.dataset.moving = "true";
            avatarRef.current.dataset.facing = dx < 0 ? "left" : "right";
          }
        } else if (avatarRef.current) {
          avatarRef.current.dataset.moving = "false";
        }
        const index = questionRef.current;
        const marker = { x: markerX[index], y: markerY[index] };
        const distance = Math.hypot(
          (playerRef.current.x - marker.x) * window.innerWidth / 100,
          (playerRef.current.y - marker.y) * window.innerHeight / 100,
        );
        const isNear = distance < 93;
        if (isNear !== nearRef.current) {
          nearRef.current = isNear;
          setNearStation(isNear);
        }
        const hazards = STAGES[stageRef.current].hazards;
        if (moving && hazards.some((hazard) => Math.hypot(
          (playerRef.current.x - hazard.x) * window.innerWidth / 100,
          (playerRef.current.y - hazard.y) * window.innerHeight / 100,
        ) < 48)) damageRef.current();
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const directionKeys = ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"];
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const writing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (writing) return;
      const key = event.key.toLowerCase();
      if (directionKeys.includes(key)) {
        event.preventDefault();
        heldKeys.current.add(key);
        return;
      }
      if ((key === "e" || key === " " || key === "enter") && !event.repeat) {
        if (key === " ") event.preventDefault();
        if (phaseRef.current === "playing") interactRef.current();
        else if (phaseRef.current === "challenge" && (feedbackRef.current?.status === "correct" || feedbackRef.current?.status === "revealed")) {
          document.getElementById("challenge-next")?.click();
        }
      }
      if (key === "escape") {
        if (phaseRef.current === "paused") setPhase(pauseFrom);
        else pauseRef.current();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => heldKeys.current.delete(event.key.toLowerCase());
    const clearKeys = () => heldKeys.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, [pauseFrom]);

  useEffect(() => {
    try { localStorage.setItem(SOUND_KEY, JSON.stringify(soundEnabled)); } catch { /* Audio preferences are optional. */ }
    if (!soundEnabled) stopAmbience();
  }, [soundEnabled, stopAmbience]);

  useEffect(() => {
    if (phase === "start" || phase === "results") return;
    const save: SavedGame = {
      name: playerName || nameDraft || "مستكشف",
      stageIndex,
      challengeIndex,
      phase,
      resumePhase: phase === "paused" ? pauseFrom : undefined,
      runScore,
      questionScores,
      passedStages,
      awardedStages,
      health,
      feedback,
      wrongCount,
      selectedOption,
      orderedPieces,
      sortAssignments,
      typedAnswer,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* Saved progress is a convenience. */ }
    setSavedRun(save);
  }, [phase, playerName, nameDraft, stageIndex, challengeIndex, runScore, questionScores, passedStages, awardedStages, health, feedback, wrongCount, selectedOption, orderedPieces, sortAssignments, typedAnswer, pauseFrom]);

  useEffect(() => {
    if (phase !== "results" || recordedRef.current) return;
    recordedRef.current = true;
    const row: RecordRow = {
      name: playerName || "مستكشف",
      score: totalScore,
      percent: successPercent,
      date: new Intl.DateTimeFormat("ar-AE", { day: "numeric", month: "short", year: "numeric" }).format(new Date()),
    };
    const next = [...leaderboard, row].sort((a, b) => b.score - a.score).slice(0, 5);
    setLeaderboard(next);
    setSavedRun(null);
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(next));
      localStorage.removeItem(SAVE_KEY);
    } catch { /* High scores are kept in memory when storage is unavailable. */ }
  }, [phase, playerName, totalScore, successPercent, leaderboard]);

  useEffect(() => () => {
    stopAmbience();
    if (audioRef.current) void audioRef.current.close();
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, [stopAmbience]);

  const resetChallengeDraft = () => {
    setWrongCount(0);
    setFeedback(null);
    setSelectedOption(null);
    setOrderedPieces([]);
    setSortAssignments({});
    setSortSelected(null);
    setTypedAnswer("");
    setDraftError("");
  };

  const startFresh = () => {
    const name = (nameDraft || playerName).trim().slice(0, 20) || "مستكشف";
    setPlayerName(name);
    setNameDraft(name);
    setStageIndex(0);
    setChallengeIndex(0);
    setRunScore(0);
    setQuestionScores(emptyScores());
    setPassedStages([false, false, false, false, false]);
    setAwardedStages([false, false, false, false, false]);
    setHealth(3);
    healthRef.current = 3;
    setFeedback(null);
    setWrongCount(0);
    setSelectedOption(null);
    setOrderedPieces([]);
    setSortAssignments({});
    setSortSelected(null);
    setTypedAnswer("");
    setDraftError("");
    setNearStation(false);
    nearRef.current = false;
    setPlayerPosition(12, 68);
    lastHitRef.current = 0;
    recordedRef.current = false;
    heldKeys.current.clear();
    try { localStorage.removeItem(SAVE_KEY); } catch { /* Continue without local storage. */ }
    setSavedRun(null);
    startAmbience();
    playTone(440, 0.18, 0.025);
    setPhase("playing");
  };

  const resumeSavedGame = () => {
    if (!savedRun) return;
    const restartingCurrentStage = savedRun.phase === "gameover";
    const restoredStage = Math.max(0, Math.min(4, savedRun.stageIndex));
    const restoredQuestion = restartingCurrentStage ? 0 : Math.max(0, Math.min(4, savedRun.challengeIndex));
    const restoredPhase = savedRun.phase === "paused" ? savedRun.resumePhase || "playing" : savedRun.phase;
    setPlayerName(savedRun.name || "مستكشف");
    setNameDraft(savedRun.name || "مستكشف");
    setStageIndex(restoredStage);
    setChallengeIndex(restoredQuestion);
    setRunScore(restartingCurrentStage ? 0 : savedRun.runScore || 0);
    setQuestionScores(savedRun.questionScores || {});
    setPassedStages(savedRun.passedStages || [false, false, false, false, false]);
    setAwardedStages(savedRun.awardedStages || [false, false, false, false, false]);
    const restoredHealth = restartingCurrentStage ? 3 : savedRun.health ?? 3;
    setHealth(restoredHealth);
    healthRef.current = restoredHealth;
    setFeedback(restartingCurrentStage ? null : savedRun.feedback || null);
    setWrongCount(restartingCurrentStage ? 0 : savedRun.wrongCount || 0);
    setSelectedOption(restartingCurrentStage ? null : savedRun.selectedOption ?? null);
    setOrderedPieces(restartingCurrentStage ? [] : savedRun.orderedPieces || []);
    setSortAssignments(restartingCurrentStage ? {} : savedRun.sortAssignments || {});
    setTypedAnswer(restartingCurrentStage ? "" : savedRun.typedAnswer || "");
    setPlayerPosition(restoredPhase === "challenge" ? markerX[restoredQuestion] : markerX[restoredQuestion] - 5, markerY[restoredQuestion]);
    setNearStation(false);
    nearRef.current = false;
    recordedRef.current = false;
    startAmbience();
    const nextPhase = restartingCurrentStage ? "playing" : restoredPhase === "stageResult" || restoredPhase === "gameover" ? restoredPhase : restoredPhase === "challenge" ? "challenge" : "playing";
    setPhase(nextPhase);
  };

  const addStagePoint = (points: number) => {
    setRunScore((score) => score + points);
    setQuestionScores((scores) => ({ ...scores, [challenge.id]: Math.max(scores[challenge.id] || 0, points) }));
  };

  const challengeIsCorrect = () => {
    if (challenge.kind === "choice" || challenge.kind === "route") return selectedOption === challenge.answer;
    if (challenge.kind === "order") return JSON.stringify(orderedPieces) === JSON.stringify(challenge.order);
    if (challenge.kind === "sort") return Boolean(challenge.cards?.every((card) => sortAssignments[card.id] === card.group));
    return challenge.validate?.(typedAnswer) ?? false;
  };

  const getReferenceAnswer = () => {
    if (challenge.kind === "choice" || challenge.kind === "route") return challenge.options?.[challenge.answer ?? 0] || "";
    if (challenge.kind === "order") return challenge.order?.join(" ") || "";
    if (challenge.kind === "sort") {
      return challenge.cards?.map((card) => `«${card.label}»: ${card.group}`).join("، ") || "";
    }
    return challenge.example || "";
  };

  const submitAnswer = () => {
    if (!challenge || feedback?.status === "correct" || feedback?.status === "revealed") return;
    if (challenge.kind === "choice" || challenge.kind === "route") {
      if (selectedOption === null) { setDraftError("اختر مسارًا أولًا."); return; }
    }
    if (challenge.kind === "order" && orderedPieces.length !== (challenge.order?.length || 0)) {
      setDraftError("استخدم الكلمات المطلوبة كلها قبل التحقّق."); return;
    }
    if (challenge.kind === "sort" && Object.keys(sortAssignments).length !== challenge.cards?.length) {
      setDraftError("ضع كل الكلمات في موضع قبل التحقّق."); return;
    }
    if (challenge.kind === "write" && !typedAnswer.trim()) {
      setDraftError("اكتب جملتك أولًا، ثم أرسلها للمراجعة."); return;
    }
    setDraftError("");
    if (challengeIsCorrect()) {
      const points = wrongCount === 0 ? 10 : 5;
      addStagePoint(points);
      setFeedback({ status: "correct", text: challenge.explanation });
      setQuestionScores((scores) => ({ ...scores, [challenge.id]: Math.max(scores[challenge.id] || 0, points) }));
      playEffect("correct");
      emitBurst(playerRef.current.x, playerRef.current.y, "mint");
      if (navigator.vibrate) navigator.vibrate(18);
    } else if (wrongCount === 0) {
      setWrongCount(1);
      setFeedback({ status: "wrong", text: challenge.hint });
      setDraftError("");
      rattle();
      playEffect("wrong");
      if (navigator.vibrate) navigator.vibrate(35);
    } else {
      setFeedback({ status: "revealed", text: `الإجابة: ${getReferenceAnswer()} — ${challenge.explanation}` });
      setQuestionScores((scores) => ({ ...scores, [challenge.id]: scores[challenge.id] || 0 }));
      playEffect("wrong");
    }
  };

  const moveToNext = () => {
    if (feedback?.status !== "correct" && feedback?.status !== "revealed") return;
    setDraftError("");
    if (challengeIndex < 4) {
      setChallengeIndex((index) => index + 1);
      resetChallengeDraft();
      setNearStation(false);
      nearRef.current = false;
      setPhase("playing");
      return;
    }
    setPhase("stageResult");
    setFeedback(null);
  };

  const retryStage = () => {
    setChallengeIndex(0);
    setRunScore(0);
    resetChallengeDraft();
    setNearStation(false);
    nearRef.current = false;
    setPlayerPosition(12, 68);
    heldKeys.current.clear();
    lastHitRef.current = 0;
    setHealth(3);
    healthRef.current = 3;
    setPhase("playing");
  };

  const continueAfterStage = () => {
    const passed = runScore >= 35;
    if (!passed) return;
    const nextPassed = [...passedStages];
    nextPassed[stageIndex] = true;
    setPassedStages(nextPassed);
    if (!awardedStages[stageIndex]) {
      const nextAwards = [...awardedStages];
      nextAwards[stageIndex] = true;
      setAwardedStages(nextAwards);
    }
    healthRef.current = 3;
    setHealth(3);
    playEffect("gem");
    emitBurst(50, 50, "gold");
    setFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 1150);
    if (stageIndex === STAGES.length - 1) {
      setPhase("results");
      return;
    }
    setStageIndex((index) => index + 1);
    setChallengeIndex(0);
    setRunScore(0);
    resetChallengeDraft();
    setPlayerPosition(12, 68);
    setNearStation(false);
    nearRef.current = false;
    lastHitRef.current = 0;
    setPhase("playing");
  };

  const assignToGroup = (cardId: string, group: string) => {
    setSortAssignments((assignments) => ({ ...assignments, [cardId]: group }));
    setSortSelected(null);
    setDraftError("");
  };

  const handlePointerStart = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    event.preventDefault();
    heldKeys.current.add(key);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Some embedded browsers omit pointer capture. */ }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    heldKeys.current.delete(key);
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer may already have been released. */ }
  };

  const skillReport = useMemo(() => {
    const totals = new Map<string, { earned: number; max: number }>();
    STAGES.flatMap((item) => item.challenges).forEach((item) => {
      const aggregate = totals.get(item.skill) || { earned: 0, max: 0 };
      aggregate.earned += questionScores[item.id] || 0;
      aggregate.max += 10;
      totals.set(item.skill, aggregate);
    });
    return [...totals.entries()].map(([name, value]) => ({ name, ...value, mastered: value.earned >= value.max * 0.7 }));
  }, [questionScores]);

  const phaseView = phase === "playing" || phase === "challenge" || phase === "paused" || phase === "stageResult" || phase === "gameover";
  const interactReady = phase === "playing" && nearStation;

  return (
    <main className={`game-root ${shake ? "screen-shake" : ""}`} dir="rtl">
      <div className={`world theme-${stageIndex} ${phase === "start" ? "world-intro" : ""} ${phase === "results" ? "world-finale" : ""}`}>
        <SceneArtwork stageIndex={phase === "start" || phase === "results" ? 4 : stageIndex} />
        <div className="world-vignette" />
        <div className="star-dust" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>

        {phase === "start" && (
          <>
            <header className="intro-top">
              <div className="brand-lockup">
                <span className="brand-mark"><GemIcon /></span>
                <span><strong>ARENA AI</strong><small>مختبر البلاغة التفاعلي</small></span>
              </div>
              <div className="intro-actions">
                <button className="quiet-control" onClick={() => setLeaderboardOpen(true)} aria-label="قائمة الأبطال">
                  <span className="tiny-crown">✦</span><span>الأبطال</span>
                </button>
                <button className="sound-control" onClick={toggleSound} aria-label={soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}>
                  {soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
                </button>
              </div>
            </header>
            <section className="intro-copy" aria-labelledby="game-title">
              <div className="eyebrow"><span className="eyebrow-line" /> خمس جواهر، وعالمٌ من المعاني</div>
              <h1 id="game-title">مغامرة في<br /><span>عالم التشبيه</span></h1>
              <p className="intro-lede">انطلق بين الواحة والقلعة ومدينة المستقبل. حلّل الصور البلاغية، واجمع جواهر البيان.</p>
              <p className="story-line"><span className="story-spark">✦</span> تفرّقت جواهر اللغة الخمس، ولا يعيدها إلى مواضعها إلا مستكشفٌ يحسن قراءة التشبيه وصناعته.</p>
              <form className="start-form" onSubmit={(event) => { event.preventDefault(); startFresh(); }}>
                <label className="player-label" htmlFor="player-name">اسم المستكشف</label>
                <div className="start-controls">
                  <input id="player-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value.slice(0, 20))} maxLength={20} placeholder="اكتب اسمك أو رمزك" />
                  <button className="primary-button start-button" type="submit">
                    <span>ابدأ المغامرة</span><span className="button-arrow" aria-hidden="true">←</span>
                  </button>
                </div>
              </form>
              <div className="intro-bottom-actions">
                <button className="text-button" onClick={() => setInstructionsOpen(true)}><span className="help-mark">؟</span> تعليمات اللعب</button>
                {savedRun && <button className="text-button resume-link" onClick={resumeSavedGame}>متابعة المغامرة <span>←</span></button>}
              </div>
              <div className="intro-microcopy"><span>للصف التاسع</span><i /> <span>٥ مراحل تفاعلية</span><i /> <span>تقدّمك محفوظ على هذا الجهاز</span></div>
            </section>
            <div className="intro-landmark" aria-hidden="true"><span className="landmark-ring" /><span>مدينة البيان</span><span className="landmark-dash" /></div>
          </>
        )}

        {phaseView && (
          <>
            <header className="game-hud">
              <div className="hud-brand">
                <span className="hud-gem"><GemIcon /></span>
                <span><strong>مغامرة في عالم التشبيه</strong><small>{playerName || "مستكشف"} <i /> الصف التاسع</small></span>
              </div>
              <div className="hud-stage">
                <div className="stage-title-line"><span>المرحلة {toArabicNumber(stageIndex + 1)} / ٥</span><b>{stage.name}</b></div>
                <div className="progress-track" aria-label={`تقدم ${currentProgress}%`}><span style={{ width: `${currentProgress}%` }} /></div>
              <div className="progress-caption"><span>{stage.subtitle}</span><span>{toArabicNumber(challengeIndex + 1)} / ٥</span></div>
              </div>
              <div className="hud-tools">
                <div className="score-readout"><span>النقاط</span><strong>{toArabicNumber(totalScore)}</strong></div>
                <div className="gem-readout"><GemIcon /><strong>{toArabicNumber(gemsCollected)}</strong><span>/ ٥</span></div>
                <div className="health-readout" aria-label={`الدروع المتبقية ${health} من 3`}>
                  {[0, 1, 2].map((heart) => <span key={heart} className={heart < health ? "shield active" : "shield"}>✦</span>)}
                </div>
                <button className="hud-icon-button" onClick={toggleSound} aria-label={soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}>{soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}</button>
                <button className="hud-icon-button pause-button" onClick={pauseGame} aria-label="إيقاف مؤقت"><PauseIcon /></button>
              </div>
            </header>

            <div className="world-note"><span className="note-star">✧</span><span>{stage.shortName}</span><i /> <span>{answeredInStage} من ٥ تحديات</span></div>

            {stage.hazards.map((hazard, index) => (
              <div key={`${stageIndex}-hazard-${index}`} className="storm-shard" style={{ left: `${hazard.x}%`, top: `${hazard.y}%` } as CSSProperties} aria-hidden="true">
                <span className="shard-aura" /><span className="shard-core">✦</span><span className="shard-spark">·</span>
              </div>
            ))}

            {stage.places.map((place, index) => {
              const active = index === challengeIndex;
              const complete = index < challengeIndex;
              return (
                <div key={`${stageIndex}-${place}`} className={`world-station ${active ? "station-active" : ""} ${complete ? "station-complete" : ""} ${index > challengeIndex ? "station-locked" : ""}`} style={{ left: `${markerX[index]}%`, top: `${markerY[index]}%` }}>
                  <button className="station-orb" onClick={() => active ? openCurrentChallenge() : showToast(complete ? "اكتملت هذه المحطة." : "أكمل المحطة الحالية أولًا.")} aria-label={`${place}${active ? "، تفاعل" : ""}`}>
                    <span className="orb-halo" /><span className="orb-glyph">{complete ? <CheckIcon /> : <GemIcon />}</span>
                    <span className="orb-number">{toArabicNumber(index + 1)}</span>
                  </button>
                  <span className="station-label">{place}</span>
                  {active && <span className={`station-prompt ${nearStation ? "prompt-ready" : ""}`}>{nearStation ? "اقتربت · تفاعل" : "بلّورة لغوية"}</span>}
                </div>
              );
            })}

            <div
              ref={avatarRef}
              className="player-avatar"
              style={{ left: `${playerRef.current.x}%`, top: `${playerRef.current.y}%` }}
              data-moving="false"
              data-facing="right"
              aria-label="المستكشف"
            >
              <span className="avatar-ground-shadow" /><span className="avatar-light" /><div className="avatar-body"><Explorer /></div>
              <span className="avatar-name">{playerName || "مستكشف"}</span>
            </div>

            {toast && <div className="game-toast" role="status"><span>✦</span>{toast}</div>}

            {(phase === "playing" || phase === "challenge") && (
              <div className="game-controls">
                <div className="movement-hint"><span>W</span><span>A</span><span>S</span><span>D</span><small>أو الأسهم للتحرّك</small></div>
                <div className="touch-pad" aria-label="أزرار الحركة">
                  <span className="pad-center" />
                  <button className="pad-key pad-up" onPointerDown={(event) => handlePointerStart(event, "arrowup")} onPointerUp={(event) => handlePointerEnd(event, "arrowup")} onPointerCancel={(event) => handlePointerEnd(event, "arrowup")} aria-label="تحرّك للأعلى">↑</button>
                  <button className="pad-key pad-left" onPointerDown={(event) => handlePointerStart(event, "arrowleft")} onPointerUp={(event) => handlePointerEnd(event, "arrowleft")} onPointerCancel={(event) => handlePointerEnd(event, "arrowleft")} aria-label="تحرّك لليسار">←</button>
                  <button className="pad-key pad-down" onPointerDown={(event) => handlePointerStart(event, "arrowdown")} onPointerUp={(event) => handlePointerEnd(event, "arrowdown")} onPointerCancel={(event) => handlePointerEnd(event, "arrowdown")} aria-label="تحرّك للأسفل">↓</button>
                  <button className="pad-key pad-right" onPointerDown={(event) => handlePointerStart(event, "arrowright")} onPointerUp={(event) => handlePointerEnd(event, "arrowright")} onPointerCancel={(event) => handlePointerEnd(event, "arrowright")} aria-label="تحرّك لليمين">→</button>
                </div>
                <div className="interact-cluster">
                  <span className="interact-caption">{nearStation ? "البلّورة جاهزة" : "اقترب من البلّورة"}</span>
                  <button className={`interact-button ${interactReady ? "interact-ready" : ""}`} onClick={openCurrentChallenge} aria-label="تفاعل مع التحدي">
                    <span className="interact-key">E</span><span className="interact-label">تفاعَل</span><span className="interact-arrow">←</span>
                  </button>
                </div>
                <div className="desktop-controls-note"><span>تحرّك لاستكشاف العالم</span><i /> <span>حلّ التحدي لتفتح الطريق</span></div>
              </div>
            )}

            {phase === "challenge" && challenge && (
              <section className="challenge-overlay" aria-labelledby="challenge-title" aria-modal="true" role="dialog">
                <div className="challenge-scrim" />
                <div className="challenge-panel">
                  <header className="challenge-head">
                    <div className="challenge-mark"><span>{toArabicNumber(challengeIndex + 1)}</span><small>تحدّي</small></div>
                    <div className="challenge-head-copy"><span>{stage.name} <i /> محطة {toArabicNumber(challengeIndex + 1)}</span><strong>جوهرة بين يديك</strong></div>
                    <div className="challenge-head-right"><span className="attempt-label">المحاولة {toArabicNumber(Math.min(wrongCount + 1, 2))} من ٢</span><button className="close-challenge" onClick={() => setPhase("playing")} aria-label="العودة إلى العالم">×</button></div>
                  </header>
                  <div className="challenge-progress-line"><span style={{ width: `${((challengeIndex + 1) / 5) * 100}%` }} /></div>
                  <div className="challenge-content">
                    <div className="challenge-type-line"><span className="type-glyph">{challenge.kind === "sort" ? "⠿" : challenge.kind === "order" ? "⇄" : challenge.kind === "write" ? "✎" : challenge.kind === "route" ? "⌁" : "✧"}</span>{challenge.kind === "sort" ? "اسحب وأسند" : challenge.kind === "order" ? "رتّب الصورة" : challenge.kind === "write" ? "اصنع عبارتك" : challenge.kind === "route" ? "اختر المسار" : "تأمّل واختر"}</div>
                    <h2 id="challenge-title">{challenge.prompt}</h2>
                    {challenge.detail && <p className="challenge-detail">{challenge.detail}</p>}

                    {(challenge.kind === "choice" || challenge.kind === "route") && (
                      <div className={`answer-options ${challenge.kind === "route" ? "route-options" : ""}`}>
                        {challenge.options?.map((option, index) => (
                          <button key={option} className={`answer-option ${selectedOption === index ? "option-selected" : ""} ${challenge.kind === "route" ? "route-option" : ""}`} onClick={() => { setSelectedOption(index); setDraftError(""); }} disabled={feedback?.status === "correct" || feedback?.status === "revealed"}>
                            <span className="option-index">{challenge.kind === "route" ? <span className="route-dash">↗</span> : toArabicNumber(index + 1)}</span><span>{option}</span><span className="option-check"><CheckIcon /></span>
                          </button>
                        ))}
                      </div>
                    )}

                    {challenge.kind === "order" && (
                      <div className="order-workspace">
                        <div className="order-dropzone">
                          <span className="work-label">ترتيبك</span>
                          <div className="ordered-pieces">
                            {orderedPieces.length === 0 && <span className="empty-order">المس الكلمات بالترتيب المناسب</span>}
                            {orderedPieces.map((piece, index) => <button key={`${piece}-${index}`} className="placed-word" onClick={() => { setOrderedPieces((items) => items.filter((_, itemIndex) => itemIndex !== index)); setDraftError(""); }} disabled={feedback?.status === "correct" || feedback?.status === "revealed"}>{piece}<span>×</span></button>)}
                          </div>
                        </div>
                        <div className="word-bank">
                          <span className="work-label">الكلمات المتاحة</span>
                          <div className="word-bank-items">
                            {challenge.fragments?.filter((fragment) => !orderedPieces.includes(fragment)).map((fragment) => <button key={fragment} className="word-chip" onClick={() => { setOrderedPieces((pieces) => [...pieces, fragment]); setDraftError(""); }} disabled={orderedPieces.length >= (challenge.order?.length || 99) || feedback?.status === "correct" || feedback?.status === "revealed"}>{fragment}<span>+</span></button>)}
                            {challenge.fragments?.every((fragment) => orderedPieces.includes(fragment)) && challenge.order?.length !== challenge.fragments?.length && <span className="unused-word-note">اخترت كلمات زائدة؟ أزِل ما لا تحتاج إليه من الترتيب أعلاه.</span>}
                          </div>
                          <button className="reset-small" onClick={() => { setOrderedPieces([]); setDraftError(""); }} disabled={feedback?.status === "correct" || feedback?.status === "revealed"}>مسح الترتيب</button>
                        </div>
                      </div>
                    )}

                    {challenge.kind === "sort" && (
                      <div className="sort-workspace">
                        <div className="sort-token-bank"><span className="work-label">الكلمات — اختر كلمة أو اسحبها</span><div className="sort-token-list">
                          {challenge.cards?.filter((card) => !sortAssignments[card.id]).map((card) => <button key={card.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)} onClick={() => setSortSelected(sortSelected === card.id ? null : card.id)} className={`sort-token ${sortSelected === card.id ? "token-selected" : ""}`} disabled={feedback?.status === "correct" || feedback?.status === "revealed"}>{card.label}<span>⠿</span></button>)}
                          {challenge.cards?.filter((card) => !sortAssignments[card.id]).length === 0 && <span className="all-sorted">أُسندت كل الكلمات؛ تحقّق من تصنيفك.</span>}
                        </div></div>
                        <div className={`sort-groups ${challenge.groups?.length === 4 ? "four-groups" : ""}`}>
                          {challenge.groups?.map((group, index) => {
                            const assigned = challenge.cards?.filter((card) => sortAssignments[card.id] === group) || [];
                            return <div key={group} className={`sort-bin ${sortSelected ? "bin-target" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) assignToGroup(id, group); }}>
                              <div className="bin-title"><span>{toArabicNumber(index + 1)}</span><strong>{group}</strong></div>
                              <div className="bin-cards" onClick={() => sortSelected && assignToGroup(sortSelected, group)}>
                                {assigned.map((card) => <button key={card.id} className="assigned-card" onClick={() => { setSortSelected(card.id); setSortAssignments((items) => { const updated = { ...items }; delete updated[card.id]; return updated; }); }} disabled={feedback?.status === "correct" || feedback?.status === "revealed"}>{card.label}<span>×</span></button>)}
                                {assigned.length === 0 && <span className="bin-placeholder">أسقط الكلمة هنا</span>}
                              </div>
                            </div>;
                          })}
                        </div>
                        {sortSelected && <p className="sort-mobile-hint">اختيرت الكلمة؛ المس موضعها الصحيح.</p>}
                      </div>
                    )}

                    {challenge.kind === "write" && (
                      <div className="writing-workspace">
                        <label className="work-label" htmlFor="creative-answer">جملتك</label>
                        <textarea id="creative-answer" value={typedAnswer} onChange={(event) => { setTypedAnswer(event.target.value.slice(0, 180)); setDraftError(""); }} maxLength={180} placeholder="اكتب جملة من إنشائك باللغة العربية..." disabled={feedback?.status === "correct" || feedback?.status === "revealed"} />
                        <div className="writing-footer"><span>تحقّق اللعبة من بنية النوع، لا من جودة الصياغة كاملةً.</span><span>{toArabicNumber(typedAnswer.length)} / ١٨٠</span></div>
                      </div>
                    )}

                    {draftError && <p className="draft-error" role="status">{draftError}</p>}
                    {feedback && (
                      <div className={`feedback-box feedback-${feedback.status}`} role="status" aria-live="polite">
                        <span className="feedback-symbol">{feedback.status === "correct" ? <CheckIcon /> : feedback.status === "wrong" ? "↺" : "✦"}</span>
                        <div><strong>{feedback.status === "correct" ? `أحسنت! +${wrongCount === 0 ? "١٠" : "٥"} نقاط` : feedback.status === "wrong" ? "ليست هذه الصورة بعد" : "اكتملت المحاولة"}</strong><p>{feedback.text}</p></div>
                      </div>
                    )}
                  </div>
                  <footer className="challenge-footer">
                    <div className="challenge-score-note"><GemIcon /><span>{toArabicNumber(runScore)} / ٥٠ نقطة في هذه المرحلة</span></div>
                    {(feedback?.status === "correct" || feedback?.status === "revealed") ? (
                      <button id="challenge-next" className="primary-button challenge-submit" onClick={moveToNext}><span>{challengeIndex < 4 ? "تابع الاستكشاف" : "إنهاء المرحلة"}</span><span className="button-arrow">←</span></button>
                    ) : (
                      <button className="primary-button challenge-submit" onClick={submitAnswer}><span>{wrongCount ? "تحقّق مرة أخرى" : "تحقّق من الإجابة"}</span><span className="button-arrow">←</span></button>
                    )}
                  </footer>
                </div>
              </section>
            )}

            {phase === "paused" && (
              <div className="state-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
                <div className="state-panel pause-panel">
                  <div className="state-sigil">Ⅱ</div><span className="state-eyebrow">استراحة قصيرة</span><h2 id="pause-title">توقّف الزمن</h2>
                  <p>عالم التشبيه ينتظرك. خذ استراحة ثم تابع من الموضع نفسه.</p>
                  <button className="primary-button state-main-button" onClick={() => setPhase(pauseFrom)}><span>تابع المغامرة</span><span className="button-arrow">←</span></button>
                  <button className="state-text-button" onClick={() => { setPhase("gameover"); heldKeys.current.clear(); }}>إنهاء الجولة الحالية</button>
                  <div className="state-shortcut"><kbd>Esc</kbd> للعودة إلى اللعبة</div>
                </div>
              </div>
            )}

            {phase === "stageResult" && (
              <div className="state-overlay" role="dialog" aria-modal="true" aria-labelledby="stage-result-title">
                {runScore >= 35 ? (
                  <div className="state-panel stage-pass-panel">
                    <div className="reward-gem"><GemIcon /></div><span className="state-eyebrow">اكتملت المحطة الكبرى</span><h2 id="stage-result-title">جوهرة {stage.gem.replace("جوهرة ", "")}</h2>
                    <p>{stageIndex === 4 ? "استعدت الجواهر الخمس وصنعت صورك الخاصة. آن أوان قراءة تقرير الرحلة." : `اجتزت ${stage.name} وفتحتَ الطريق إلى العالم التالي.`}</p>
                    <div className="stage-result-tally"><span><small>نتيجتك</small><strong>{toArabicNumber(runScore)}<i> / ٥٠</i></strong></span><span><small>المستوى المطلوب</small><strong>٧٠٪</strong></span><span><small>مكافأة الجوهرة</small><strong>+١٠</strong></span></div>
                    <button className="primary-button state-main-button" onClick={continueAfterStage}><span>{stageIndex === 4 ? "عرض تقرير الرحلة" : "افتح العالم التالي"}</span><span className="button-arrow">←</span></button>
                  </div>
                ) : (
                  <div className="state-panel stage-retry-panel">
                    <div className="state-sigil retry-sigil">↺</div><span className="state-eyebrow">المحطة ما زالت مفتوحة</span><h2 id="stage-result-title">لنحاول من جديد</h2>
                    <p>تحتاج إلى ٣٥ نقطة من ٥٠ لفتح المرحلة التالية. راجع التلميحات وحاول مرة أخرى.</p>
                    <div className="retry-meter"><span style={{ width: `${Math.min((runScore / 50) * 100, 100)}%` }} /></div>
                    <div className="retry-score"><strong>{toArabicNumber(runScore)} / ٥٠</strong><span>الحد الأدنى: ٣٥ نقطة</span></div>
                    <button className="primary-button state-main-button" onClick={retryStage}><span>أعِد المرحلة</span><span className="button-arrow">↻</span></button>
                    <button className="state-text-button" onClick={() => setInstructionsOpen(true)}>راجع تعليمات اللعب</button>
                  </div>
                )}
              </div>
            )}

            {phase === "gameover" && (
              <div className="state-overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
                <div className="state-panel gameover-panel">
                  <div className="state-sigil danger-sigil">✦</div><span className="state-eyebrow">انطفأت الدروع الثلاثة</span><h2 id="gameover-title">هدأت العاصفة</h2>
                  <p>احتفظتَ بتقدّمك على هذا الجهاز. أعد المغامرة أو ارجع إلى البداية عندما تستعد.</p>
                  <div className="gameover-score"><span>ما جمعته حتى الآن</span><strong>{toArabicNumber(totalScore)} نقطة</strong></div>
                  <button className="primary-button state-main-button" onClick={startFresh}><span>إعادة اللعب الآن</span><span className="button-arrow">↻</span></button>
                  <button className="state-text-button" onClick={() => { setPhase("start"); setNameDraft(playerName); }}>العودة إلى البداية</button>
                </div>
              </div>
            )}

          </>
        )}

        {phase === "results" && (
          <section className="results-overlay" aria-labelledby="results-title">
            <div className="results-topline"><div className="brand-lockup"><span className="brand-mark"><GemIcon /></span><span><strong>ARENA AI</strong><small>تقرير مغامرة البيان</small></span></div><button className="sound-control" onClick={toggleSound} aria-label={soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}>{soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}</button></div>
            <div className="results-main">
              <div className="results-heading"><span className="eyebrow"><span className="eyebrow-line" /> اكتملت الرحلة يا {playerName}</span><h1 id="results-title">صنعتَ من اللغة<br /><span>عالمًا من الصور.</span></h1><p>استعدت الجواهر الخمس، واجتزتَ كل عوالم التشبيه. هذا ملخّص رحلتك.</p></div>
              <div className="results-report">
                <div className="report-score"><span>مجموع النقاط</span><strong>{toArabicNumber(totalScore)}<i> / ٣٠٠</i></strong><div className="report-progress"><span style={{ width: `${successPercent}%` }} /></div><small>نسبة نجاح التحديات: {toArabicNumber(successPercent)}٪</small></div>
                <div className="report-facts"><div><span>الجواهر</span><strong>{toArabicNumber(gemsCollected)} / ٥</strong></div><div><span>المراحل المكتملة</span><strong>{toArabicNumber(passedStages.filter(Boolean).length)} / ٥</strong></div><div><span>المستكشف</span><strong>{playerName || "مستكشف"}</strong></div></div>
                <div className="skill-report"><div className="report-section-title"><strong>خريطة المهارات</strong><span>التمكّن عند ٧٠٪ فأكثر</span></div>
                  <div className="skill-list">
                    {skillReport.map((skill) => <div key={skill.name} className="skill-row"><span className={`skill-status ${skill.mastered ? "mastered" : "review"}`}>{skill.mastered ? <CheckIcon /> : "↺"}</span><span>{skill.name}</span><div className="skill-bar"><span style={{ width: `${skill.max ? (skill.earned / skill.max) * 100 : 0}%` }} /></div><small>{skill.mastered ? "متقن" : "للمراجعة"}</small></div>)}
                  </div>
                </div>
                <div className="results-actions"><button className="primary-button" onClick={startFresh}><span>إعادة اللعب</span><span className="button-arrow">↻</span></button><button className="print-button" onClick={() => window.print()}><PrintIcon /> طباعة النتيجة</button><button className="leaderboard-result-button" onClick={() => setLeaderboardOpen(true)}>قائمة الأبطال</button></div>
                <p className="local-note">تُحفظ النتائج على هذا الجهاز فقط؛ لا يوجد إرسال إلى خادم.</p>
              </div>
            </div>
          </section>
        )}

        {flash && <div className="celebration-flash" />}
        <div className="particle-layer" aria-hidden="true">{bursts.map((burst) => (
          <div key={burst.id} className={`particle-burst burst-${burst.tone}`} style={{ left: `${burst.x}%`, top: `${burst.y}%` }}>
            {Array.from({ length: 14 }, (_, index) => {
              const angle = (Math.PI * 2 * index) / 14;
              const radius = 26 + ((index * 17) % 42);
              return <i key={index} style={{ "--dx": `${Math.cos(angle) * radius}px`, "--dy": `${Math.sin(angle) * radius}px`, "--delay": `${(index % 5) * 18}ms` } as CSSProperties} />;
            })}
            <span className="burst-ring" />
          </div>
        ))}</div>

        {toast && phase === "start" && <div className="game-toast start-toast" role="status">{toast}</div>}

        {instructionsOpen && <InstructionsModal onClose={() => setInstructionsOpen(false)} />}
        {leaderboardOpen && <LeaderboardModal entries={leaderboard} onClose={() => setLeaderboardOpen(false)} />}
      </div>
    </main>
  );
}

function toArabicNumber(value: number) {
  return String(value).replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function InstructionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="instructions-title">
      <div className="utility-modal instructions-modal">
        <button className="utility-close" onClick={onClose} aria-label="إغلاق">×</button>
        <span className="state-eyebrow">دليل المستكشف</span><h2 id="instructions-title">كيف تلعب؟</h2>
        <p className="utility-intro">خمسة عوالم، وخمس جواهر لغوية. في كل محطة تحدٍّ قصير يفتح لك الطريق.</p>
        <div className="instruction-rows">
          <div><span className="instruction-icon">↔</span><p><strong>تحرّك واستكشف</strong><small>استخدم WASD أو الأسهم، وعلى الهاتف استخدم لوحة الحركة.</small></p></div>
          <div><span className="instruction-icon">E</span><p><strong>اقترب وتفاعل</strong><small>اقترب من البلّورة المضيئة، ثم اضغط E أو زر «تفاعل».</small></p></div>
          <div><span className="instruction-icon">✧</span><p><strong>فكّر في الصورة</strong><small>لكل تحدٍّ محاولتان. الأولى الصحيحة تمنح ١٠ نقاط، والثانية ٥.</small></p></div>
          <div><span className="instruction-icon">◇</span><p><strong>اجمع الجواهر</strong><small>تحتاج إلى ٣٥ نقطة من ٥٠ في كل مرحلة لفتح العالم التالي.</small></p></div>
          <div><span className="instruction-icon">!</span><p><strong>انتبه لشظايا العاصفة</strong><small>تجنّب الشظايا البنفسجية؛ ثلاث إصابات تنهي الجولة.</small></p></div>
        </div>
        <div className="instruction-footer"><span><kbd>Esc</kbd> إيقاف مؤقت</span><button className="primary-button" onClick={onClose}><span>فهمت، لننطلق</span><span className="button-arrow">←</span></button></div>
      </div>
    </div>
  );
}

function LeaderboardModal({ entries, onClose }: { entries: RecordRow[]; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
      <div className="utility-modal leaderboard-modal">
        <button className="utility-close" onClick={onClose} aria-label="إغلاق">×</button>
        <span className="state-eyebrow">أعلى النتائج على هذا الجهاز</span><h2 id="leaderboard-title">أبطال البيان</h2>
        <p className="utility-intro">جدول محلي على جهازك؛ لا تُرسل النتائج إلى أي خادم.</p>
        {entries.length === 0 ? <div className="leaderboard-empty"><GemIcon /><strong>هنا تبدأ الحكاية</strong><span>أكمل مغامرتك لتظهر نتيجتك في القائمة.</span></div> : (
          <div className="leaderboard-list">{entries.map((entry, index) => <div key={`${entry.name}-${entry.date}-${index}`} className={`leaderboard-row ${index === 0 ? "leader-first" : ""}`}><span className="rank-number">{toArabicNumber(index + 1)}</span><span className="rank-name"><strong>{entry.name}</strong><small>{entry.date} · نجاح {toArabicNumber(entry.percent)}٪</small></span><strong className="rank-score">{toArabicNumber(entry.score)}<small> نقطة</small></strong></div>)}</div>
        )}
        <div className="leaderboard-footer"><span>أفضل ٥ نتائج محفوظة محليًا</span><button className="primary-button" onClick={onClose}><span>العودة</span><span className="button-arrow">←</span></button></div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.4 4.2L19.5 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SoundOnIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M16 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function SoundOffIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="m17 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14m8-14v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

function PrintIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2m-10-3h10v7H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M17 12h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}