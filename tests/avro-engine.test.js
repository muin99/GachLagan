const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'keyboard', 'source', 'avro-engine.js'),
  'utf8'
);
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.parser = OmicronLab.Avro.Phonetic;`, context);

test('transliterates common Avro input', () => {
  assert.equal(context.parser.parse('ami'), 'আমি');
  assert.equal(context.parser.parse('bangladesh'), 'বাংলাদেশ');
  assert.equal(context.parser.parse('ami banglay gan gai'), 'আমি বাংলায় গান গাই');
});

test('keeps Avro case-sensitive distinctions', () => {
  assert.equal(context.parser.parse('t'), 'ত');
  assert.equal(context.parser.parse('T'), 'ট');
  assert.equal(context.parser.parse('sh'), 'শ');
  assert.equal(context.parser.parse('Sh'), 'ষ');
});

test('supports Avro punctuation and conjuncts', () => {
  assert.equal(context.parser.parse('.'), '।');
  assert.equal(context.parser.parse('kSh'), 'ক্ষ');
  assert.equal(context.parser.parse('gg'), 'জ্ঞ');
});

test('Keyman adapter composes live text and handles phonetic backspace', () => {
  const target = { text: '' };
  context.KeymanWeb = {
    KC(length, _unused, currentTarget) {
      return currentTarget.text.slice(-length);
    },
    KO(deleteCount, currentTarget, output) {
      currentTarget.text = currentTarget.text.slice(0, -deleteCount) + output;
    }
  };

  for (const character of 'ami') {
    target.text += character;
    context.avroCompose(target);
  }
  assert.equal(target.text, 'আমি');

  context.avroBackspace(target);
  assert.equal(target.text, 'আম');

  target.text += ' ';
  context.avroCommit(target);
  for (const character of 'bangla') {
    target.text += character;
    context.avroCompose(target);
  }
  assert.equal(target.text, 'আম বাংলা');
});

test('stale composition never deletes host text as a word', () => {
  const target = { text: '' };
  context.KeymanWeb = {
    KC(length, _unused, currentTarget) {
      return currentTarget.text.slice(-length);
    },
    KO(deleteCount, currentTarget, output) {
      currentTarget.text = currentTarget.text.slice(0, -deleteCount) + output;
    }
  };

  context.avroReset();
  for (const character of 'ami') {
    target.text += character;
    context.avroCompose(target);
  }
  target.text += '৳'; // Represents direct host/symbol-layer output.
  context.avroBackspace(target);
  assert.equal(target.text, 'আমি');
});
