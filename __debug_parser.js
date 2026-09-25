const { csvToJson } = require('./main.js');

const raw = [
  'introHerzlichen Willkommen bei unserer Campusralley.',
  'question_0_typemultiple-choice-group',
  'question_0_textAllgemeine Infos',
  'question_0_subquestion_1_textWie viele Studierende gibt es aktuell an der THD?',
  'question_0_subquestion_1_optionsca. 5.100|ca. 7.500|ca. 9.600|ca. 12.000',
  'question_0_subquestion_1_answerca. 9.600question_0_subquestion_2_textUnd wie viele Partnerhochschulen hat die THD weltweit?',
  'question_0_subquestion_2_optionsca. 80|ca. 150|ca. 220|ca. 380',
  'question_0_subquestion_2_answerca. 220question_0_letterZquestion_0_correctTextAn der THD studieren aktuell rund 9.600 Studierende.',
  'question_9_textIch stehe mitten auf dem Campus.',
  'question_9_answerTREPPEquestion_9_letterDquestion_9_correctTextRichtig! Unsere Campustreppe steht symbolisch für die "Treppe zum Erfolg".'
].join('\n');

const out = csvToJson(raw);
console.log(JSON.stringify({
  questionCount: out.questions.length,
  first: out.questions[0],
  last: out.questions[9],
  intro: out.intro,
  question0Letter: out.questions[0]?.letter,
  question9Letter: out.questions[9]?.letter
}, null, 2));
