const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..', 'extraResources', 'vietphrase');

async function downloadFile(url, destPath) {
  console.log(`Downloading: ${url} -> ${destPath}`);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  fs.writeFileSync(destPath, Buffer.from(res.data));
  console.log(`Saved ${path.basename(destPath)} (${(res.data.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // 1. PhienAm / ChinesePhienAmWords (Hán Việt từng chữ)
  const phienAmPath = path.join(TARGET_DIR, 'ChinesePhienAmWords.txt');
  if (!fs.existsSync(phienAmPath)) {
    await downloadFile(
      'https://raw.githubusercontent.com/ThanhPhuoc91/VietPhrase/master/ChinesePhienAmWords.txt',
      phienAmPath
    );
  }

  // 2. VietPhrase core
  const vietphrasePath = path.join(TARGET_DIR, 'VietPhrase.txt');
  if (!fs.existsSync(vietphrasePath)) {
    await downloadFile(
      'https://raw.githubusercontent.com/ThanhPhuoc91/VietPhrase/master/VietPhrase.txt',
      vietphrasePath
    );
  }

  // 3. Pronouns
  const pronounsPath = path.join(TARGET_DIR, 'Pronouns.txt');
  if (!fs.existsSync(pronounsPath)) {
    await downloadFile(
      'https://raw.githubusercontent.com/ThanhPhuoc91/VietPhrase/master/Pronouns.txt',
      pronounsPath
    );
  }

  // 4. Short Drama Specific Phrases
  const dramaDictPath = path.join(TARGET_DIR, 'short_drama_phrases.txt');
  const dramaPhrases = `和离后=sau khi ly hôn
和离=ly hôn
我带女儿=tôi dẫn con gái
横扫魔域=quét sạch ma vực
持械入宋=cầm vũ khí về thời Tống
第十季=phần 10
第三季=phần 3
第四季=phần 4
第二季=phần 2
第一季=phần 1
反派拿捏=nắm thóp nhân vật phản diện
装瘫=giả liệt
高调离婚=ly hôn rầm rộ
修仙满级=tu tiên cấp tối đa
回现代=về hiện đại
横着走=đi ngang
大唐憨婿=chàng rể ngốc Đại Đường
太子妃=Thái tử phi
边军破刀=đao cũ biên quân
一路砍到=một đường chém đến
裂土封王=phong hầu xưng vương
养老房=nhà dưỡng già
重获新生=tái sinh
战神归来=chiến thần trở về
战神=chiến thần
当奶爸=làm bố bỉm
奶爸=bố bỉm
神豪保安=bảo vệ thần hào
神豪=thần hào
保安=bảo vệ
小保姆=cô bảo mẫu
保姆=bảo mẫu
打脸=vả mặt
虐渣=trừng trị kẻ ác
赘婿=chàng rể ở rể
逆袭=nghịch tập
无敌=vô địch
重生=trọng sinh
穿越=xuyên không
首富=đại phú hào
千金=thiên kim tiểu thư
真假千金=thiên kim thật giả
真千金=thiên kim thật
假千金=thiên kim giả
总裁=tổng tài
夫人=phu nhân
前夫=chồng cũ
前妻=vợ cũ
婆婆=mẹ chồng
公公=bố chồng
儿媳=con dâu
岳母=mẹ vợ
岳父=bố vợ
女婿=con rể
徒儿=đồ nhi
下山=xuống núi
出山=xuất sơn
退婚=hủy hôn
隐退=ở ẩn
隐形首富=đại phú hào ngầm
神医=thần y
龙王=Long Vương
阎王=Diêm Vương
修罗=Tu La
战皇=Chiến Hoàng
仙帝=Tiên Đế
魔皇=Ma Hoàng
开局=mở đầu
签到=điểm danh nhận thưởng
系统=hệ thống
震惊=chấn động
无双=vô song
巅峰=đỉnh phong
绝顶=tuyệt đỉnh
妖孽=yêu nghiệt
绝世=tuyệt thế
狂飙=bứt phá cuồng phong
短剧=phim ngắn
全集=trọn bộ
完结=hoàn thành
`;
  fs.writeFileSync(dramaDictPath, dramaPhrases, 'utf8');
  console.log('Saved short_drama_phrases.txt');

  console.log('VietPhrase dictionary setup complete!');
}

main().catch(console.error);
