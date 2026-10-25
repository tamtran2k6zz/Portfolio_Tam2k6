import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVisual} from '../src/project-visual.js';

test('project screenshots match the repository, not similar project titles', () => {
  const project = link => ({title: 'Portfolio MySQL', stack: 'React', link});
  assert.equal(projectVisual(project('https://github.com/tamtran2k6zz/Website_Portfolio_De13')).image, 'portfolio-home.webp');
  assert.equal(projectVisual(project('https://github.com/tamtran2k6zz/My_Web_Server')).image, 'eduquiz.webp');
  assert.equal(projectVisual(project('https://github.com/tamtran2k6zz/_Web_ZShop')).image, null);
  assert.equal(projectVisual(project('https://github.com/other/My_Web_Server')).real, false);
  assert.equal(projectVisual(project('')).real, false);
});
