// The hero animation, loaded on demand by Hero.astro: the phone streams its reply in, a few
// words at a time, the way `textStream` delivers it. The page renders the full reply (the still
// frame); the loop clears it, streams it and holds the end.
import { sleep, whenVisible } from '../site/anim';

export default function runHero(viz: HTMLElement) {
  const reply = viz.querySelector<HTMLElement>('[data-reply]');
  if (!reply) return;
  // The server-rendered paragraphs are the script.
  const paragraphs = [...reply.children].map((p) => (p.textContent ?? '').split(' '));

  const play = async () => {
    reply.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.textContent = '▍';
    await sleep(900);
    for (const words of paragraphs) {
      const p = document.createElement('p');
      reply.append(p);
      for (const word of words) {
        p.append(`${p.textContent ? ' ' : ''}${word}`);
        p.append(cursor);
        await sleep(55 + Math.random() * 70);
      }
      await sleep(240);
    }
    cursor.remove();
    await sleep(4200);
  };

  // Under reduced motion the server-rendered final state is the still frame: nothing to do.
  whenVisible(viz, play, () => {});
}
