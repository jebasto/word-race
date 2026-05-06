// Mangaatha — Tanglish dialogue scripts.
// Each scene is a list of {who: 'muru'|'mami'|..., text}
// who maps to a draw function via FAMILY (or 'muru' → drawMuru).

const SCENES = {
  pre1: [
    { who: 'muru',  text: '"Mami! Vanakkam… ennama, nalla irrukingala?"' },
    { who: 'mami',  text: '"Etho irrukan, dei Murugesa. Ungalukku enna theriyum."' },
    { who: 'muru',  text: '"Aiyyo, enna aachu mami? Solunga, naan paathukaren!"' },
    { who: 'mami',  text: '"Indha pongal-a unnoda athai-ku peacock blue Kanjivaram saree thaan venum. Gold border, my exact size. T. Nagar full kalakitten — kidaiyaadhu!"' },
    { who: 'muru',  text: '"Dho! Naane poyi T. Nagar la vaangaren mami. Two minutes-la! Ungalukku evlo periya help pannidaren-na, after that wedding-ku full okay sollanum!"' },
    { who: 'mami',  text: '"Periya pesathadha. Saree konduvaa. Then we talk."' },
  ],
  win1: [
    { who: 'muru', text: '"Mami! Idho saree! Peacock blue, gold border, exact size!"' },
    { who: 'mami', text: '"Aiyyo… idhu correct color-aa irukku! Even gold border-um perfect-aa irukku. Sari da, vandhu sapdu."' },
    { who: 'muru', text: '"(Phew. One down… seven more to go.)"' },
  ],
  fail1: [
    { who: 'mami', text: '"I knew it. You cannot even fetch a saree on time. How are you going to take care of my Meenu?!"' },
  ],
  pre2: [
    { who: 'mama', text: '"Murugesan. Sit. So you somehow got past my wife. Impressive. But meaning-illa."' },
    { who: 'mama', text: '"My puja room walls are bare. I want a Tanjore painting — authentic, 22 carat gold relief. The Periyar Gallery has one. They closed an hour ago."' },
    { who: 'muru', text: '"Mama, gallery moodi irukke!"' },
    { who: 'mama', text: '"Boy. Doors close. Walls remain. Find a way. Don\'t get caught — those guards are paid by me. Don\'t embarrass us."' },
    { who: 'muru', text: '"(45 seconds before the alarm. Three guards with torchlights. Easy.)"' },
  ],
  win2: [
    { who: 'mama', text: '"Hmm. The relief is genuine. The gold weight matches. You knew what you were looking for."' },
    { who: 'mama', text: '"Sit. Have coffee. We will talk about Meenu… eventually. Not today."' },
  ],
  fail2: [
    { who: 'mama', text: '"Caught like a fool by my own guards. Imagine the headlines. Out. Out!"' },
  ],
};

// Render a character into a circular cutscene canvas.
function drawCutsceneAvatar(cv, key, frame) {
  const cx = cv.getContext('2d');
  cx.clearRect(0, 0, cv.width, cv.height);
  // Coloured background pad
  const member = FAMILY.find(m => m.key === key);
  const colour = key === 'muru' ? '#C0392B' : (member?.color || '#888');
  cx.fillStyle = colour;
  cx.beginPath(); cx.arc(cv.width/2, cv.height/2, cv.height/2 - 10, 0, Math.PI*2); cx.fill();
  // Character feet at bottom of pad
  const fx = cv.width / 2;
  const fy = cv.height - 30;
  if (key === 'muru')           drawMuru(cx, fx, fy, frame);
  else if (member)              member.draw(cx, fx, fy, frame);
}
