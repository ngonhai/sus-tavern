// i18n.js — vi (default) + en. t('key', {x:1}) replaces {x}.
const I18N = {
  vi: {
    addBot: '+ Thêm bạn máy', rmBot: 'Bỏ', pickChar: 'Chọn nhân vật', chars: { pig: 'Lợn', fox: 'Cáo', dog: 'Chó', goat: 'Dê', octo: 'Bạch tuộc', penguin: 'Cánh cụt', hawk: 'Diều hâu', turtle: 'Rùa' }, botTag: 'máy', seatsFull: 'Bàn đã đủ chỗ.',
    gunT: 'Súng của {n}', gunL: 'Còn 1 viên trong {r} ổ chưa bóp', gunUsed: 'Đã bóp {a}/6 lần', gunRisk: 'Rủi ro lần tới: {p}%', gunPull: 'Bóp cò', gunClose: 'Đóng',
    title: 'Sus Tavern', sub: 'Quán rượu của những kẻ nói dối. Đặt bài úp, chọc tức người kế bên, và đừng để đến lượt mình bóp cò.',
    name: 'Tên của bạn', namePh: 'Khách lạ', you: 'Bạn', botNames: ['Mập', 'Ranh', 'Lì', 'Mốc'],
    create: 'Tạo phòng', join: 'Vào phòng', offline: 'Chơi với máy', code: 'Mã phòng (5 ký tự)', createBtn: 'Tạo phòng mới', joinBtn: 'Vào phòng', startOff: 'Ngồi xuống bàn',
    offHint: 'Ngồi bàn với các con vật do máy điều khiển, ngay trên thiết bị này.', onlineOff: 'Không kết nối được Firebase: chỉ chơi được với máy.',
    resumeT: 'Ván đang dở', resumeB: 'Bạn còn một ván chưa xong.', resume: 'Tiếp tục',
    roomCode: 'Mã phòng — chạm để chép link', seats: 'Ghế quanh bàn (2–5 người)', seatFree: 'Ghế trống…', host: 'Chủ phòng', off: 'mất kết nối',
    rules: 'Luật chơi', rDevil: 'Lá Quỷ (Devil)', rDevilD: 'Thêm 1 lá Quỷ vào bộ bài, trông Y HỆT Joker khi cầm trên tay. Không bao giờ là lá thật; ai bị lật ra lá Quỷ thì CẢ BÀN lần lượt bóp cò.', rBots: 'Số bạn máy', rBotsD: 'Số con vật do máy điều khiển ngồi cùng bạn.',
    on: 'Bật', offS: 'Tắt', onlyHost: 'Chỉ chủ phòng chỉnh được luật.',
    start: 'Bắt đầu', needTwo: 'Cần ít nhất 2 người.', waitHost: 'Chờ chủ phòng bắt đầu…', leave: 'Rời bàn', help: 'Luật', copied: 'Đã chép link mời',
    round: 'Vòng {n}', roundN: 'Vòng {n}', tableCard: 'Lá bàn', cardName: { A: 'Át', K: 'Già (K)', Q: 'Dame (Q)', J: 'Joker', D: 'Quỷ' }, cardShort: { A: 'Át', K: 'K', Q: 'Q', J: 'Joker', D: 'Quỷ' },
    turnYou: 'Đến lượt bạn', turnOf: 'Lượt của {n}', pullYou: 'Bóp cò đi…', pullOf: '{n} phải bóp cò', waitingFor: 'Chờ {n}…',
    play: 'Đặt {n} lá', playHint: 'Chọn 1–3 lá, đặt úp và tuyên bố là "{c}"', liar: 'NÓI DỐI!', liarHint: 'Lật bài người trước', mustCall: 'Hết bài — buộc phải lật bài người trước', pull: 'Bóp cò',
    claims: '{n} đặt {k} lá "{c}"', calls: '{n} hét: "Nói dối!"', reveal: 'Lật bài của {n}…', honestT: '{n} nói thật! {m} phải bóp cò.', liarT: '{n} nói dối! Tự bóp cò.', devilT: 'LÁ QUỶ! Cả bàn bóp cò!',
    pullT: '{n} bóp cò…', click: 'Tách.', bang: 'ĐOÀNG!', dead: '{n} gục xuống.', safe: '{n} sống sót ({a}/6).', winner: '{n} là kẻ sống sót cuối cùng!', youWin: 'Bạn thắng!', youLose: 'Bạn đã gục.', rematch: 'Chơi lại', toLobby: 'Về sảnh',
    risk: 'Rủi ro {p}%', chambers: 'Ổ đạn {a}/6', cardsLeft: '{n} lá', deadTag: 'đã chết', specTag: 'Khán giả', exit: 'Thoát', camSide: 'Góc bàn', camP: 'Góc {n}', spec: 'Khán giả',
    d3: '3D', d2: '2D', no3d: 'Không bật được 3D (cần WebGL).', music: 'Nhạc', sound: 'Âm thanh', mute: 'Tắt',
    helpT: 'Cách chơi', helpB: ['Mỗi vòng có một lá bàn (Át / K / Q). Mỗi người cầm 5 lá.', 'Đến lượt: đặt 1–3 lá úp và tuyên bố đó là lá bàn — hoặc hét "Nói dối!" với người ngay trước.', 'Joker thay được mọi lá. Lật bài: toàn lá bàn/Joker thì người hét sai, ngược lại người đặt bài sai. Người thua bóp cò súng của mình (6 ổ, 1 viên, mỗi lần bóp đạn tiến một ổ).', 'Hết bài thì buộc phải lật bài người trước. Người cuối cùng sống sót thắng.', 'Chế độ 3D: bấm đúp mặt bàn để đập bàn, bấm vào một con vật để chỉ tay vào nó.', 'Tuỳ chọn Lá Quỷ: trông giống Joker nhưng KHÔNG thay được lá nào (luôn là nói dối); lật ra thì cả bàn lần lượt bóp cò. Joker thật thì luôn an toàn.'],
    ok: 'Đã hiểu', hostLeft: 'Chủ phòng đã rời.', noRoom: 'Không tìm thấy phòng.', needName: 'Nhập tên trước đã.', youAreSpec: 'Bàn đã đầy / ván đang chạy: bạn xem với tư cách khán giả.', spectating: 'Đang xem',
    emotes: { laugh: 'Hahaha', angry: 'Grừ', sus: 'Hmm… sus', sweat: 'Run quá' }, emote: 'Biểu cảm'
  },
  en: {
    addBot: '+ Add bot', rmBot: 'Remove', pickChar: 'Pick your animal', chars: { pig: 'Pig', fox: 'Fox', dog: 'Dog', goat: 'Goat', octo: 'Octopus', penguin: 'Penguin', hawk: 'Hawk', turtle: 'Turtle' }, botTag: 'bot', seatsFull: 'The table is full.',
    gunT: '{n}\'s revolver', gunL: '1 bullet in {r} chambers left', gunUsed: '{a}/6 pulled', gunRisk: 'Next pull: {p}% risk', gunPull: 'Pull trigger', gunClose: 'Close',
    title: 'Sus Tavern', sub: 'A tavern full of liars. Play face-down, call your neighbour out, and try not to be the one pulling the trigger.',
    name: 'Your name', namePh: 'Stranger', you: 'You', botNames: ['Chunk', 'Slick', 'Grim', 'Moss'],
    create: 'Create room', join: 'Join room', offline: 'Play vs bots', code: 'Room code (5 chars)', createBtn: 'Create new room', joinBtn: 'Join room', startOff: 'Take a seat',
    offHint: 'Sit down with animals run by the computer, right on this device.', onlineOff: 'Firebase is unreachable: only play vs bots.',
    resumeT: 'Game in progress', resumeB: 'You have an unfinished game.', resume: 'Resume',
    roomCode: 'Room code — tap to copy link', seats: 'Seats around the table (2–5)', seatFree: 'Empty seat…', host: 'Host', off: 'offline',
    rules: 'Rules', rDevil: 'Devil card', rDevilD: 'Adds one Devil card that looks EXACTLY like a Joker in your hand. It is never honest; if it is revealed, EVERYONE pulls the trigger in turn.', rBots: 'Bots', rBotsD: 'How many computer-controlled animals sit with you.',
    on: 'On', offS: 'Off', onlyHost: 'Only the host can change rules.',
    start: 'Start', needTwo: 'At least 2 players needed.', waitHost: 'Waiting for the host…', leave: 'Leave table', help: 'Rules', copied: 'Invite link copied',
    round: 'Round {n}', roundN: 'Round {n}', tableCard: 'Table card', cardName: { A: 'Ace', K: 'King', Q: 'Queen', J: 'Joker', D: 'Devil' }, cardShort: { A: 'Ace', K: 'K', Q: 'Q', J: 'Joker', D: 'Devil' },
    turnYou: 'Your turn', turnOf: '{n}\'s turn', pullYou: 'Pull the trigger…', pullOf: '{n} must pull the trigger', waitingFor: 'Waiting for {n}…',
    play: 'Play {n}', playHint: 'Pick 1–3 cards, play them face-down and claim "{c}"', liar: 'LIAR!', liarHint: 'Flip the previous play', mustCall: 'Out of cards — you must call the previous player', pull: 'Pull trigger',
    claims: '{n} plays {k} "{c}"', calls: '{n} shouts: "Liar!"', reveal: 'Revealing {n}\'s cards…', honestT: '{n} told the truth! {m} pulls the trigger.', liarT: '{n} lied! Pulls the trigger.', devilT: 'THE DEVIL! Everyone pulls!',
    pullT: '{n} pulls…', click: 'Click.', bang: 'BANG!', dead: '{n} drops dead.', safe: '{n} survives ({a}/6).', winner: '{n} is the last one standing!', youWin: 'You win!', youLose: 'You are dead.', rematch: 'Rematch', toLobby: 'Lobby',
    risk: 'Risk {p}%', chambers: 'Chamber {a}/6', cardsLeft: '{n} cards', deadTag: 'dead', specTag: 'Spectator', exit: 'Exit', camSide: 'Table view', camP: '{n}\'s view', spec: 'Spectator',
    d3: '3D', d2: '2D', no3d: '3D unavailable (WebGL needed).', music: 'Music', sound: 'Sound', mute: 'Mute',
    helpT: 'How to play', helpB: ['Each round has a table card (Ace / King / Queen). Everyone holds 5 cards.', 'On your turn: play 1–3 cards face-down claiming they are the table card — or shout "Liar!" at the player before you.', 'Jokers are wild. On a call, if all cards are table cards/Jokers the caller was wrong, otherwise the player who played was lying. The loser pulls their own trigger (6 chambers, 1 bullet, each pull moves it one chamber).', 'With no cards left you must call the previous player. Last one alive wins.', '3D mode: double-click the table to slam it, click an animal to point at it.', 'Devil option: looks like a Joker but is never honest (it is not wild); revealed, it makes everybody pull the trigger in turn. A real Joker is always safe.'],
    ok: 'Got it', hostLeft: 'The host left.', noRoom: 'Room not found.', needName: 'Enter a name first.', youAreSpec: 'Table full / game running: you are watching as a spectator.', spectating: 'Watching',
    emotes: { laugh: 'Hahaha', angry: 'Grr', sus: 'Hmm… sus', sweat: 'Yikes' }, emote: 'Emote'
  }
};
let LANG = (function () { try { const s = localStorage.getItem('sus_lang'); if (s && I18N[s]) return s; } catch (e) {} return (navigator.language || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi'; })();
function setLang(l) { if (I18N[l]) { LANG = l; try { localStorage.setItem('sus_lang', l); } catch (e) {} } }
function t(key, v) {
  let s = I18N[LANG][key]; if (s == null) s = I18N.vi[key]; if (s == null) return key;
  if (typeof s !== 'string') return s;
  return v ? s.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m) : s;
}
