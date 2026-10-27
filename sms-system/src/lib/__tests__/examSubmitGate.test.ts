import { describe, expect, it } from 'vitest';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/take/index.tsx?raw';
import startRaw from '../../components/exam/take/ExamStartScreen.tsx?raw';
import screenRaw from '../../components/exam/take/ExamAttemptScreen.tsx?raw';
import barRaw from '../../components/exam/take/ExamBottomBar.tsx?raw';

// The Submit gate, the no-skipping rule of a forward-only exam and the locked screen at 00:00, as the running attempt and
// the take page wire them. What the screens show is in examTakeScreens.test.ts and examForwardOnly.test.ts.

const norm = (s: string) => s.split('\r\n').join('\n');
const running = norm(runningRaw);
const page = norm(pageRaw);
const start = norm(startRaw);
const screen = norm(screenRaw);
const bar = norm(barRaw);

describe('the running attempt', () => {
  it('counts the questions without an answer with the same rule as the screen', () => {
    expect(running).toContain('const unanswered = unansweredCount(questions, answers);');
    expect(running).toContain('canSubmit: unanswered === 0,');
  });

  it('opens the confirmation only when every question is answered and there is time', () => {
    expect(running).toContain('askToSubmit: () => {\n      if (unanswered > 0 || timeUp) return;');
  });

  it('refuses to move on from an unanswered question of a forward-only exam, where it moves', () => {
    expect(running).toContain('canAdvance(questions[from], latest.current.answers, forwardOnly)');
    expect(running).toContain('canGoTo(from, target, forwardOnly, questions.length, ');
  });

  it('fixes the answers at 00:00: no answering, flagging, moving or asking to submit', () => {
    expect(running).toContain('const timeUp = remaining <= 0;');
    expect(running).toContain('if (!question || timeUp) return;');
    expect(running).toContain('toggleFlag: (questionId: string) => {\n      if (timeUp) return;');
    expect(running).toContain('select: (target: number) => {\n      if (timeUp) return;');
  });

  it('leaves the automatic submit alone: it does not look at how many are answered', () => {
    const tick = running.slice(running.indexOf('const tick = useCallback'), running.indexOf('useEffect(() => {\n    const id = setInterval(tick'));
    expect(tick).toContain('void submit("timeout")');
    expect(tick).not.toContain('unanswered');
    expect(tick).not.toContain('canSubmit');
  });

  it('keeps a save state, and the take page hands it to the screen', () => {
    expect(page).toContain('saveState={run.saveState}');
    expect(page).not.toContain('saveStatus');
  });
});

describe('the screens', () => {
  it('tells the student on the start screen that each question must be answered before the next in a forward-only exam', () => {
    expect(start).toContain('You answer the questions in order, and each one must be answered before you move to the next: once you move on you cannot come back to this one.');
  });

  it('shows the save text through the layout rule, not as a string of its own', () => {
    expect(screen).toContain('visibleSaveText(saveState, carousel)');
    expect(screen).toContain('useMediaQuery(CAROUSEL_QUERY)');
  });

  it('disables the question, the navigator and the buttons when time is up', () => {
    expect(screen).toContain('const timeUp = remainingMs <= 0;');
    expect(screen).toContain('disabled={timeUp}');
    expect(bar).toContain('disabled={unanswered > 0 || timeUp}');
    expect(bar).toContain('disabled={timeUp || forwardOnly || index === 0}');
  });
});
