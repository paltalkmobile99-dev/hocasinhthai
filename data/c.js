/**
 * UNIFIED SMART APP CONTROLLER - HIGH PERFORMANCE + MAXIMUM SECURITY
 * Cập nhật 20/08/2026
 * - Hỗ trợ 3 miền + chọn đài theo ngày
 * - Nhập tay + Nhập nhanh thông minh (parse đoạn dài)
 * - Bảng xem lại có chỉnh sửa / trả số / xóa
 * - Bảng Chi Tiết mới rõ ràng, tô đỏ số trúng
 */

// ================= GLOBAL STATE =================
let groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
let activeGroup = 'A';
let currentUser = "Nhóm Quản Lý 01";
let appData = {};
let isUnlocked = false;
let autoPurgeEnabled = true;
let skipComparisonModal = false;          // false = luôn hiện bảng xem lại
let selectedStations = [];                // đài đang được chọn
let pendingInputItems = [];
let inputSessionCount = 0;
let detailPage = 1;
const DETAIL_PAGE_SIZE = 100;
let detailSearchTerm = '';
let detailMatchFilter = 'all';           // 'all' | 'matched' (chỉ trúng) | 'unmatched' (chỉ trật) — dùng để nhà cái lọc đối chiếu
// Lọc theo Miền/Đài dạng CÂY — tick 1 miền (không tick đài con nào) = xem
// GỘP hết đài của miền đó; tick thêm đài con cụ thể mới thu hẹp lại đúng đài
// đó. Rỗng cả 2 Set = không lọc theo miền/đài (giữ hành vi "Tất cả" cũ).
let detailRegionFilter = new Set();      // Set các miền đang tick: 'MN'/'MT'/'MB'
let detailStationFilterSet = new Set();  // Set tên đài cụ thể đang tick (thuộc bất kỳ miền nào ở trên)

// Key localStorage
const STORAGE_KEY_PATTERN = "SEA_LOTTO_PATTERN_SECURITY_PASS";
const STORAGE_KEY_USER = "SEA_LOTTO_CURRENT_USER_NAME";

// ================= INDEXEDDB =================
const DB_NAME = "SeaLottoBigDataDB";
const DB_VERSION = 1;
let dbInstance = null;
// Chỉ cho phép một giao dịch ghi chạy tại một thời điểm. Trước đây `await
// store.put(...)` không thực sự chờ IndexedDB, nên các lần nhập liên tiếp có
// thể bị ghi chồng khi người dùng tải lại trang ngay sau đó.
let appStateSaveQueue = Promise.resolve();
let saveTimeout = null;

const BET_TYPES = {
    // --- LÔ BAO & CÀNG THƯỜNG ---
    'bl':        { name: 'Bao Lô (2C)', prizes: { MB: 27, MT: 18, MN: 18 } },
    '2c':        { name: 'Bao Lô 2C', prizes: { MB: 27, MT: 18, MN: 18 } },
    '3c':        { name: 'Bao Lô 3C', prizes: { MB: 23, MT: 17, MN: 17 } },
    'c2':        { name: '2C', prizes: { MB: 1, MT: 1, MN: 1 } },
    'c3':        { name: '3C', prizes: { MB: 1, MT: 1, MN: 1 } },
    // ĐÃ BỎ "4 Càng" (cược đúng 4 chữ số, tỷ lệ riêng 8800 lần) — xác nhận
    // hệ thống chỉ có ĐÚNG 3 kiểu cược thật (2C/3C/Đá), không có kiểu số 4
    // chữ số nào cả, "nghĩ 4 Càng" trước đây là hiểu sai. "4C" giờ là mã
    // KHÁCH MIỀN BẮC hay gõ để chỉ "4 Cuối" — cùng 1 khái niệm với '5c'/
    // 'g3g2g1db' bên dưới (Trung/Nam gọi "5 Cuối" vì gộp thêm Giải 3, Bắc
    // gọi "4 Cuối" vì không có Giải 3 trong tổ hợp) — dùng LUÔN chung 1
    // công thức/số lô theo miền (xem getBetTypeTiers), không tách mã riêng.
    '4c':        { name: '4/5 Cuối GĐB', prizes: { MB: 4, MT: 5, MN: 5 } },
    // Số lô MB đã sửa lại đúng theo Cocomi: ở Miền Bắc, tổ hợp này CHỈ gồm
    // G2+G1+ĐB (4 lô, Bắc gọi là "4 Cuối") — không có G3 như Trung/Nam (5
    // lô, gọi "5 Cuối"). Xem getBetTypeTiers cho phần tổ hợp giải theo miền.
    '5c':        { name: '5 Cuối GĐB', prizes: { MB: 4, MT: 5, MN: 5 } },
    '10c':       { name: '10 Cuối GĐB', prizes: { MB: 10, MT: 10, MN: 10 } },
    'bao4c':     { name: 'Bao 4 Càng (cũ)', prizes: { MB: 20, MT: 16, MN: 16 } },

    // --- CÁC CƯỢC LÔ THEO SỐ LƯỢNG GIẢI ---
    '7lo':       { name: '7 Lô Đầu', prizes: { MB: 7, MT: 7, MN: 7 } },
    '10lo':      { name: '10 Lô', prizes: { MB: 10, MT: 10, MN: 10 } },
    // Miền Bắc đã xác nhận với Cocomi: "10 Cuối" = ĐB+G1+G2+G3 = 10 lô.
    // Miền Trung/Nam CHƯA có xác nhận riêng cho "10 Cuối" — số lô 10 ở đây
    // tạm giữ nguyên như trước, cần hỏi lại nếu MT/MN có dùng cách gọi này.
    '10cuoi':    { name: '10 Lô Cuối', prizes: { MB: 10, MT: 10, MN: 10 } },
    '12lo':      { name: '12 Lô', prizes: { MB: 12, MT: 12, MN: 12 } },
    // "14 Cuối" — CHỈ Miền Bắc theo Cocomi (ĐB+G1+G2+G3+G4 = 14 lô). Miền
    // Trung/Nam không có khái niệm này nên để 0 (ẩn khỏi lựa chọn MT/MN).
    '14cuoi':    { name: '14 Lô Cuối (Đặc Biệt → Giải 4, riêng Miền Bắc)', prizes: { MB: 14, MT: 0, MN: 0 } },
    '14lo':      { name: '14 Lô Cuối', prizes: { MB: 14, MT: 14, MN: 14 } },
    '16lo':      { name: '16 Lô Cuối', prizes: { MB: 16, MT: 16, MN: 16 } },

    // --- XỈU CHỦ / ĐẦU ĐUÔI / ĐẶC BIỆT ---
    'dd':        { name: 'Đầu Đuôi', prizes: { MB: 5, MT: 2, MN: 2 } }, // MB: 4G7 + 1GĐB | MT/MN: 1G8 + 1GĐB
    'dau':       { name: 'Đầu (G8 / G7)', prizes: { MB: 4, MT: 1, MN: 1 } }, // MB: G7(4 giải) | MT/MN: G8(1 giải)
    'duoi':      { name: 'Đuôi (GĐB)', prizes: { MB: 1, MT: 1, MN: 1 } },
    'de':        { name: 'Đề (2 số đặc biệt MB)', prizes: { MB: 1, MT: 1, MN: 1 } },
    'dau_db':    { name: 'Đầu Đặc Biệt (2 số đầu GĐB)', prizes: { MB: 1, MT: 1, MN: 1 } },
    
    'xc':        { name: 'Xỉu Chủ (Đầu+Đuôi)', prizes: { MB: 4, MT: 2, MN: 2 } }, // MB: 3G6 + 1GĐB | MT/MN: 1G7 + 1GĐB
    'xc_dau':    { name: 'Xỉu Chủ Đầu', prizes: { MB: 3, MT: 1, MN: 1 } }, // MB: G6 (3 giải) | MT/MN: G7 (1 giải)
    'xc_duoi':   { name: 'Xỉu Chủ Đuôi', prizes: { MB: 1, MT: 1, MN: 1 } },
    'db':        { name: 'Đặc Biệt', prizes: { MB: 1, MT: 1, MN: 1 } },

    // --- GIẢI LẺ CỤ THỂ ---
    'g1':        { name: 'Giải 1', prizes: { MB: 1, MT: 1, MN: 1 } },
    'g2':        { name: 'Giải 2', prizes: { MB: 2, MT: 1, MN: 1 } },
    'g3':        { name: 'Giải 3', prizes: { MB: 6, MT: 2, MN: 2 } },
    'g4':        { name: 'Giải 4', prizes: { MB: 4, MT: 7, MN: 7 } },
    'g5':        { name: 'Giải 5', prizes: { MB: 6, MT: 1, MN: 1 } },
    'g6':        { name: 'Giải 6', prizes: { MB: 3, MT: 3, MN: 3 } },
    'g7':        { name: 'Giải 7', prizes: { MB: 4, MT: 1, MN: 1 } },
    'g8':        { name: 'Giải 8', prizes: { MB: 0, MT: 1, MN: 1 } },
    'g6g3':      { name: 'Giải 6 + Giải 3', prizes: { MB: 9, MT: 5, MN: 5 } },
    'g7g6':      { name: 'Giải 7 + Giải 6', prizes: { MB: 7, MT: 4, MN: 4 } },
    'g6g5':      { name: 'Giải 6 + Giải 5', prizes: { MB: 9, MT: 4, MN: 4 } },
    'g5g4':      { name: 'Giải 5 + Giải 4', prizes: { MB: 10, MT: 8, MN: 8 } },
    'g3g2':      { name: 'Giải 3 + Giải 2', prizes: { MB: 8, MT: 3, MN: 3 } },
    'g2g1':      { name: 'Giải 2 + Giải 1', prizes: { MB: 3, MT: 2, MN: 2 } },
    'g1db':      { name: 'Giải 1 + Đặc Biệt', prizes: { MB: 2, MT: 2, MN: 2 } },
    'g6g4':      { name: 'Giải 6 + Giải 4', prizes: { MB: 7, MT: 10, MN: 10 } },
    'g4g3':      { name: 'Giải 4 + Giải 3', prizes: { MB: 10, MT: 9, MN: 9 } },
    'g6g4g3':    { name: 'Giải 6 + Giải 4 + Giải 3', prizes: { MB: 13, MT: 12, MN: 12 } },
    'g7g6g5g4':  { name: '12 Đầu (G7 + G6 + G5 + G4)', prizes: { MB: 17, MT: 12, MN: 12 } },
    'g8g7g6g5g4': { name: '13 Đầu (G8 + G7 + G6 + G5 + G4)', prizes: { MB: 17, MT: 13, MN: 13 } },
    // Số lô MB đã sửa lại đúng theo Cocomi — xem chú thích ở mã '5c' phía
    // trên (Miền Bắc: G2+G1+ĐB = 4 lô, KHÔNG có G3 như Trung/Nam).
    'g3g2g1db':  { name: '5 Cuối (G3 + G2 + G1 + ĐB)', prizes: { MB: 4, MT: 5, MN: 5 } },
    // Bổ sung theo xác nhận Cocomi (29/08/2026) — chỉ có ở Miền Trung/Nam
    // (dựa trên G7/G8, Miền Bắc không có cách gọi tương ứng được xác nhận):
    'g7g6g5':    { name: '5 Đầu (G7 + G6 + G5)', prizes: { MB: 0, MT: 5, MN: 5 } },
    'g8g7g6g5':  { name: '6 Đầu (G8 + G7 + G6 + G5)', prizes: { MB: 0, MT: 6, MN: 6 } },
    // "12 Cuối" — KHÁC "12 Đầu" (g7g6g5g4) dù trùng số lô 12 do ngẫu nhiên;
    // đây tính từ G4 xuống ĐB (đuôi), "12 Đầu" tính từ G7 xuống G4 (đầu).
    'g4g3g2g1db': { name: '12 Cuối (G4 + G3 + G2 + G1 + ĐB)', prizes: { MB: 0, MT: 12, MN: 12 } },
    '3d':        { name: '3 Đầu', prizes: { MB: 3, MT: 3, MN: 3 } },
    '8d':        { name: '8 Đầu', prizes: { MB: 8, MT: 8, MN: 8 } },
    '10d':       { name: '10 Đầu', prizes: { MB: 10, MT: 10, MN: 10 } },
    '12d':       { name: '12 Đầu', prizes: { MB: 17, MT: 12, MN: 12 } },
    '13d':       { name: '13 Đầu', prizes: { MB: 17, MT: 13, MN: 13 } },
    'g4lo5':     { name: 'G4 Lô (5 giải)', prizes: { MB: 5, MT: 5, MN: 5 } },
    'g4lo7':     { name: 'G4 Lô (7 giải)', prizes: { MB: 7, MT: 7, MN: 7 } },
    'g6lo1':     { name: 'G6 Lô (1 giải)', prizes: { MB: 1, MT: 1, MN: 1 } },

    // --- CƯỢC TẬP HỢP / ĐÁ XIÊN ---
    // "prizes" của cả 3 mã Đá dưới đây CHỈ LÀ SỐ GIỮ CHỖ, không dùng để tính
    // tiền thật (calculateItemFinancials có nhánh RIÊNG cho da/dx/dv, tính
    // theo số lô/con × số con thật trong pairNums, không bao giờ đọc prizes
    // ở đây) — NHƯNG dropdown chọn tay lại dùng "prizes[miền] === 0" để
    // ẨN loại không áp dụng miền đó (VD "14 Cuối" chỉ Bắc). Để prizes = 0 ở
    // đây từng làm ẨN LUÔN cả 3 loại Đá khỏi dropdown Ở MỌI MIỀN — lỗi thật
    // đã xảy ra, không chọn tay được Đá Thẳng/Xiên/Chéo. Đổi thành 1 (khác 0)
    // để không bị hiểu nhầm là "không áp dụng miền nào" — Đá áp dụng CẢ 3 miền.
    'da':        { name: 'Đá Thẳng', prizes: { MB: 1, MT: 1, MN: 1 } },
    // Xác nhận Cocomi: "Xiên" = cả nhóm là 1 cược, đủ hết số mới trúng.
    'dx':        { name: 'Đá Xiên (cả nhóm, thiếu 1 số là thua)', prizes: { MB: 1, MT: 1, MN: 1 } },
    // "Chéo" = tách từng cặp riêng, trúng phần vẫn ăn — CÙNG cơ chế với
    // Đá Vòng/Liên Hoàn, không phải với "Xiên" như trước đây hiểu nhầm.
    // Tên gọi CHỈ dùng đúng chữ "Đá Chéo" như Cocomi nói — trước đây ghép
    // thêm "/ Vòng / Liên Hoàn" (tên gọi cũ trong app từ trước khi có xác
    // nhận Cocomi) khiến tên hiển thị dài dòng, khó hiểu, không ai nhận ra
    // đây chính là "Đá Chéo". Mã 'dv' giữ nguyên (không đổi, tránh vỡ dữ liệu
    // cũ), chỉ đổi CHỮ HIỂN THỊ cho đúng và gọn như khách/Cocomi hay gọi.
    'dv':        { name: 'Đá Chéo (tách từng cặp, trúng phần vẫn ăn)', prizes: { MB: 1, MT: 1, MN: 1 } },
    'day_so':    { name: 'Dãy Số (20 đến 30)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'chan_chan': { name: 'Chẵn Chẵn', prizes: { MB: 27, MT: 18, MN: 18 } },
    'le_le':     { name: 'Lẻ Lẻ', prizes: { MB: 27, MT: 18, MN: 18 } },
    'chan_le':   { name: 'Chẵn Lẻ', prizes: { MB: 27, MT: 18, MN: 18 } },
    'le_chan':   { name: 'Lẻ Chẵn', prizes: { MB: 27, MT: 18, MN: 18 } },
    'giap':      { name: '12 Con Giáp', prizes: { MB: 27, MT: 18, MN: 18 } },

    // --- CON GIÁP RIÊNG LẺ (gõ đúng 1 con, không cần "giáp" cả 100 số) ---
    // "dậu" (gà) và "dê" KHÔNG dùng được ở đây vì bỏ dấu trùng "dau"=Đầu và
    // "de"=Đề (2 từ khóa cược đã có sẵn, rất thông dụng) — dùng tên Hán Việt
    // (Dậu → gõ "ga", Mùi → gõ "mui") để khỏi đụng hàng.
    'ty':   { name: 'Tý (Chuột)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'suu':  { name: 'Sửu (Trâu)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'dan':  { name: 'Dần (Hổ)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'mao':  { name: 'Mão (Mèo)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'thin': { name: 'Thìn (Rồng)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'ran':  { name: 'Tỵ (Rắn)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'ngo':  { name: 'Ngọ (Ngựa)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'mui':  { name: 'Mùi (Dê)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'than': { name: 'Thân (Khỉ)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'ga':   { name: 'Dậu (Gà)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'tuat': { name: 'Tuất (Chó)', prizes: { MB: 27, MT: 18, MN: 18 } },
    'hoi':  { name: 'Hợi (Heo)', prizes: { MB: 27, MT: 18, MN: 18 } }
};

// Các mã "Cược tổng hợp" (gộp sẵn nhiều giải) có TÊN đã tự ghi rõ đủ các
// giải bên trong (VD "Giải 7 + Giải 6", "5 Cuối (G3+G2+G1+ĐB)"...) — dùng
// chung 1 danh sách này ở CẢ 3 chỗ: (1) chỉ hiện ĐÚNG các mã này trong
// dropdown chọn loại — không hiện song song mã viết tắt trùng công thức
// (VD '5c'/'12d'/'13d') để khỏi có 2 lựa chọn ra cùng 1 kết quả gây rối;
// (2) không hiện thêm badge "🎯 ..." cho các mã này vì tên đã tự nói rõ,
// hiện thêm chỉ lặp lại y chang; (3) getManualTypeKey() quy các mã viết tắt
// trùng công thức về đúng mã rõ ràng tương ứng trong danh sách này.
const SELF_DESCRIBING_TIER_TYPES = [
    'g7g6', 'g6g5', 'g5g4', 'g3g2', 'g2g1', 'g1db',
    'g6g3', 'g6g4', 'g4g3', 'g6g4g3',
    'g7g6g5g4', 'g8g7g6g5g4', 'g3g2g1db',
    'g7g6g5', 'g8g7g6g5', 'g4g3g2g1db'
];
// Map 12 con giáp chuẩn (tên Hán Việt + tên gọi thường ngày miền Nam/Trung —
// người nhập liệu quen gõ "chuột", "heo", "rắn"... hơn là "tý", "hợi", "tỵ").
const ZODIAC_TY = ['00', '12', '24', '36', '48', '60', '72', '84', '96'];
const ZODIAC_SUU = ['01', '13', '25', '37', '49', '61', '73', '85', '97'];
const ZODIAC_DAN = ['02', '14', '26', '38', '50', '62', '74', '86', '98'];
const ZODIAC_MAO = ['03', '15', '27', '39', '51', '63', '75', '87', '99'];
const ZODIAC_THIN = ['04', '16', '28', '40', '52', '64', '76', '88'];
const ZODIAC_TY_RAN = ['05', '17', '29', '41', '53', '65', '77', '89'];
const ZODIAC_NGO = ['06', '18', '30', '42', '54', '66', '78', '90'];
const ZODIAC_MUI = ['07', '19', '31', '43', '55', '67', '79', '91'];
const ZODIAC_THAN = ['08', '20', '32', '44', '56', '68', '80', '92'];
const ZODIAC_DAU = ['09', '21', '33', '45', '57', '69', '81', '93'];
const ZODIAC_TUAT = ['10', '22', '34', '46', '58', '70', '82', '94'];
const ZODIAC_HOI = ['11', '23', '35', '47', '59', '71', '83', '95'];

const ZODIAC_MAP = {
    'ty': ZODIAC_TY, 'chuot': ZODIAC_TY,
    'suu': ZODIAC_SUU, 'trau': ZODIAC_SUU,
    'dan': ZODIAC_DAN, 'ho': ZODIAC_DAN, 'cop': ZODIAC_DAN,
    'mao': ZODIAC_MAO, 'meo': ZODIAC_MAO,
    'thin': ZODIAC_THIN, 'rong': ZODIAC_THIN,
    'ty_ran': ZODIAC_TY_RAN, 'ran': ZODIAC_TY_RAN,
    'ngo': ZODIAC_NGO, 'ngua': ZODIAC_NGO,
    'mui': ZODIAC_MUI, 'de': ZODIAC_MUI,
    'than': ZODIAC_THAN, 'khi': ZODIAC_THAN,
    'dau': ZODIAC_DAU, 'ga': ZODIAC_DAU,
    'tuat': ZODIAC_TUAT, 'cho': ZODIAC_TUAT,
    'hoi': ZODIAC_HOI, 'heo': ZODIAC_HOI, 'lon': ZODIAC_HOI
};

const ALL_ZODIAC_NUMS = [...new Set(Object.values(ZODIAC_MAP).flat())];

const PAIR_SETS_NORM = {
    'le le': ['11','13','15','17','19','31','33','35','37','39','51','53','55','57','59','71','73','75','77','79','91','93','95','97','99'],
    'le chan': ['10','12','14','16','18','30','32','34','36','38','50','52','54','56','58','70','72','74','76','78','90','92','94','96','98'],
    'chan chan': ['00','02','04','06','08','20','22','24','26','28','40','42','44','46','48','60','62','64','66','68','80','82','84','86','88'],
    'chan le': ['01','03','05','07','09','21','23','25','27','29','41','43','45','47','49','61','63','65','67','69','81','83','85','87','89']
};

// Dàn số cố định cho các loại cược "cả cụm" (Chẵn/Lẻ theo cặp, 12 Con Giáp) —
// gõ tên loại là tự bung đủ dàn số có sẵn, không cần gõ tay từng số.
const PATTERN_TYPE_NUMS = {
    'le_le': PAIR_SETS_NORM['le le'],
    'le_chan': PAIR_SETS_NORM['le chan'],
    'chan_chan': PAIR_SETS_NORM['chan chan'],
    'chan_le': PAIR_SETS_NORM['chan le'],
    'giap': ALL_ZODIAC_NUMS,
    // 12 con giáp riêng lẻ — gõ đúng 1 con là ra đúng dàn số của con đó.
    'ty': ZODIAC_TY,
    'suu': ZODIAC_SUU,
    'dan': ZODIAC_DAN,
    'mao': ZODIAC_MAO,
    'thin': ZODIAC_THIN,
    'ran': ZODIAC_TY_RAN,
    'ngo': ZODIAC_NGO,
    'mui': ZODIAC_MUI,
    'than': ZODIAC_THAN,
    'ga': ZODIAC_DAU,
    'tuat': ZODIAC_TUAT,
    'hoi': ZODIAC_HOI
};

function getPrizeCount(betTypeKey, region = 'MT') {
    // "g4lo6" = đúng 1 vị trí cụ thể trong Giải 4 → luôn 1 lô, mọi miền.
    if (/^g[1-8]lo\d+$/.test(betTypeKey)) return 1;
    const type = BET_TYPES[betTypeKey];
    if (!type) return 18; // Default fallback
    if (typeof type.prizes === 'number') return type.prizes;
    // "|| type.prizes['MT']" coi 0 là falsy nên tự thay bằng số của MT —
    // NHƯNG 0 ở đây thường là CỐ Ý (VD 'g8'/'g7g6g5' Miền Bắc không có
    // Giải 8 nên phải là 0, không phải mượn tạm số của MT/MN). Chỉ fallback
    // khi region đó THẬT SỰ chưa khai báo trong "prizes" (undefined).
    return type.prizes[region] !== undefined ? type.prizes[region] : type.prizes['MT'];
}

// Ví dụ sử dụng:
// getPrizeCount('10cuoi', 'MT') => 10
// getPrizeCount('bl', 'MB')     => 27

// ================= BẢO MẬT =================
// SHA-256 thuần JS (không phụ thuộc crypto.subtle vì app có thể chạy ở
// file:// / môi trường không secure-context, nơi Web Crypto bị vô hiệu).
function sha256Hex(str) {
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    const utf8 = unescape(encodeURIComponent(str));
    const bitLen = utf8.length * 8;
    let padded = utf8 + String.fromCharCode(0x80);
    padded += '\0'.repeat((56 - (padded.length % 64) + 64) % 64);
    const lenHi = Math.floor(bitLen / 0x100000000), lenLo = bitLen >>> 0;
    for (let i = 3; i >= 0; i--) padded += String.fromCharCode((lenHi >>> (i * 8)) & 0xff);
    for (let i = 3; i >= 0; i--) padded += String.fromCharCode((lenLo >>> (i * 8)) & 0xff);

    for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
        const w = new Array(64).fill(0);
        for (let i = 0; i < 16; i++) {
            w[i] = (padded.charCodeAt(chunkStart + i * 4) << 24) |
                (padded.charCodeAt(chunkStart + i * 4 + 1) << 16) |
                (padded.charCodeAt(chunkStart + i * 4 + 2) << 8) |
                (padded.charCodeAt(chunkStart + i * 4 + 3));
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (hh + S1 + ch + k[i] + w[i]) | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + temp1) | 0;
            d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// Mã Admin không còn lưu dạng chữ thường trong code — chỉ lưu bản băm SHA-256.
// Mặc định tương ứng mã "VN@" (đổi được qua promptSetNewAdminCode, lưu vào localStorage).
const ADMIN_HASH_KEY = "SEA_LOTTO_ADMIN_HASH";
const ADMIN_HASH_DEFAULT = "e09a1f631e0f865b161fd3179267c16293c7456a62eafc29284dd6ddac0cc385";

function getAdminHash() {
    return localStorage.getItem(ADMIN_HASH_KEY) || ADMIN_HASH_DEFAULT;
}

function verifyAdminCode(inputCode) {
    if (!inputCode) return false;
    return sha256Hex(inputCode.trim().toUpperCase()) === getAdminHash();
}

function promptSetNewAdminCode() {
    customPrompt("🔑 MÃ ADMIN MỚI", "Nhập mã Admin MỚI...", "", (newCode) => {
        if (!newCode || !newCode.trim()) return showToast("Đã hủy đổi mã Admin!", "error");
        const newHash = sha256Hex(newCode.trim().toUpperCase());
        localStorage.setItem(ADMIN_HASH_KEY, newHash);
        showModal({
            title: "✅ Đã Đổi Mã Admin",
            body: `
                <div style="text-align:center;">
                    <p style="margin-bottom:10px;">Mã Admin mới đã được lưu (băm SHA-256). Mã cũ không còn dùng được nữa.</p>
                    <p style="margin-bottom:6px; font-size:13px; opacity:.8;">Bản sao lưu mã hóa (nên copy lại phòng khi trình duyệt bị xóa dữ liệu):</p>
                    <input readonly value="${newHash}" style="width:100%; text-align:center; font-size:12px; padding:8px; box-sizing:border-box;" onclick="this.select()">
                    <button class="btn btn-blue" style="margin-top:10px;" onclick="executeCopyText('${newHash}')">📋 Copy mã hóa</button>
                </div>`,
            isPrompt: false
        });
        showToast("Đổi mã Admin thành công!", "success");
    });
}

function encryptPattern(patternArray) {
    const raw = JSON.stringify(patternArray);
    return btoa(unescape(encodeURIComponent(raw + "|SEA_SECURE|" + Date.now().toString().slice(-4))));
}

function decryptPattern(encrypted) {
    try {
        const decoded = decodeURIComponent(escape(atob(encrypted)));
        const pure = decoded.split("|SEA_SECURE|")[0];
        return JSON.parse(pure);
    } catch (e) {
        return null;
    }
}

// ================= LỊCH ĐÀI THEO NGÀY =================
const STATION_SCHEDULE = {
    MB: {
        1: ['Hà Nội'],
        2: ['Quảng Ninh'],
        3: ['Bắc Ninh'],
        4: ['Hà Nội'],
        5: ['Hải Phòng'],
        6: ['Nam Định'],
        0: ['Thái Bình']
    },
    MT: {
        1: ['Thừa Thiên Huế', 'Phú Yên'],
        2: ['Đắk Lắk', 'Quảng Nam'],
        3: ['Đà Nẵng', 'Khánh Hòa'],
        4: ['Quảng Bình', 'Bình Định', 'Quảng Trị'],
        5: ['Gia Lai', 'Ninh Thuận'],
        6: ['Đà Nẵng', 'Quảng Ngãi', 'Đắk Nông'],
        0: ['Khánh Hòa', 'Kon Tum', 'Thừa Thiên Huế']
    },
    MN: {
        1: ['TP. Hồ Chí Minh', 'Đồng Tháp', 'Cà Mau'],
        2: ['Bến Tre', 'Vũng Tàu', 'Bạc Liêu'],
        3: ['Đồng Nai', 'Cần Thơ', 'Sóc Trăng'],
        4: ['Tây Ninh', 'An Giang', 'Bình Thuận'],
        5: ['Bình Dương', 'Vĩnh Long', 'Trà Vinh'],
        6: ['TP. Hồ Chí Minh', 'Long An', 'Bình Phước', 'Hậu Giang'],
        0: ['Tiền Giang', 'Kiên Giang', 'Đà Lạt']
    }
};

const STATION_ABBR = {
    'Hà Nội': 'HN', 'Quảng Ninh': 'QN', 'Bắc Ninh': 'BN', 'Hải Phòng': 'HP',
    'Nam Định': 'NĐ', 'Thái Bình': 'TB',
    'Phú Yên': 'PY', 'Thừa Thiên Huế': 'HUE', 'Huế': 'HUE',
    'Đắk Lắk': 'ĐL', 'Quảng Nam': 'QNa', 'Đà Nẵng': 'ĐN', 'Khánh Hòa': 'KH',
    'Quảng Bình': 'QB', 'Bình Định': 'BĐ', 'Quảng Trị': 'QT',
    'Gia Lai': 'GL', 'Ninh Thuận': 'NT', 'Quảng Ngãi': 'QNg', 'Đắk Nông': 'ĐNô',
    'Kon Tum': 'KT',
    'TP. Hồ Chí Minh': 'HCM', 'Đồng Tháp': 'ĐT', 'Cà Mau': 'CM',
    'Bến Tre': 'BT', 'Vũng Tàu': 'VT', 'Bạc Liêu': 'BL',
    'Đồng Nai': 'ĐNai', 'Cần Thơ': 'CT', 'Sóc Trăng': 'ST',
    'Tây Ninh': 'TN', 'An Giang': 'AG', 'Bình Thuận': 'BTh',
    'Vĩnh Long': 'VL', 'Bình Dương': 'BD', 'Trà Vinh': 'TV',
    'Long An': 'LA', 'Bình Phước': 'BP', 'Hậu Giang': 'HG',
    'Tiền Giang': 'TG', 'Kiên Giang': 'KG', 'Đà Lạt': 'ĐLạt'
};

// Màu riêng cho từng miền — dùng ở thanh ngang mỗi "Lượt nhập" trong Bảng
// Chi Tiết, để phân biệt nhanh bằng MÀU thay vì phải đọc chữ cột "Đài" từng
// dòng (1 nhóm 1 ngày thường có rất nhiều tin xen kẽ đủ 3 miền). Cũng dùng
// trong Hướng Dẫn để giải thích ý nghĩa từng màu.
const REGION_HEADER_COLOR = {
    MN: '#f59e0b', // cam — Miền Nam
    MT: '#00f3ff', // xanh cyan — Miền Trung
    MB: '#c084fc'  // tím — Miền Bắc
};

// Dò xem nội dung dán vào có nhắc tới tên đài nào không (VD "Vĩnh Long") —
// chỉ nhận đúng tên chuẩn (có/không dấu), không đoán các cách viết tắt tùy
// tiện như "Vlong". Dùng để CẢNH BÁO nhẹ khi đài nhắc tới khác đài đang chọn,
// không chặn nhập.
function detectMentionedStations(rawText) {
    if (!rawText || typeof removeAccents !== 'function') return [];
    const textNorm = removeAccents(String(rawText).toLowerCase());
    const found = [];
    for (const full of Object.keys(STATION_ABBR)) {
        const nameNorm = removeAccents(full.toLowerCase()).replace(/^tp\.\s*/, '').trim();
        if (nameNorm.length < 4) continue; // tên quá ngắn dễ trùng ngẫu nhiên, bỏ qua
        const re = new RegExp('\\b' + nameNorm.replace(/\s+/g, '\\s+') + '\\b', 'i');
        if (re.test(textNorm)) found.push(full);
    }
    return [...new Set(found)];
}

function getTodayStations(region) {
    const day = new Date().getDay();
    return STATION_SCHEDULE[region]?.[day] || [];
}

function resolveStations(region) {
    if (selectedStations && selectedStations.length > 0) {
        return [...selectedStations];
    }
    return getMainStation(region || 'MT');
}

function onRegionChange() {
    selectedStations = [];
    showTodayStationsPanel(false);
}

function showTodayStationsPanel(showNotice = true) {
    const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const stations = getTodayStations(region);
    const panel = document.getElementById('station-select-panel');
    const container = document.getElementById('station-checkboxes');
    if (!panel || !container) return;

    if (stations.length === 0) {
        showToast('Không có đài nào cho miền này hôm nay', 'error');
        return;
    }

    const hint = document.getElementById('station-selection-hint');
    if (hint) hint.innerHTML = `Đài ${region} mở thưởng hôm nay: <b style="color:#fbbf24;">${stations.map(s => STATION_ABBR[s] || s).join(', ')}</b>. Tick các đài cần đánh:`;

    container.innerHTML = stations.map((s, idx) => {
        const abbr = STATION_ABBR[s] || s.substring(0, 3).toUpperCase();
        const checked = selectedStations.includes(s) ? 'checked' : '';
        const mainTag = idx === 0 ? ' <span style="color:#fbbf24;font-size:10px;">(chính)</span>' : '';
        return `
            <label style="display:flex;align-items:center;gap:4px;background:#1e293b;padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer;">
                <input type="checkbox" value="${s}" ${checked} onchange="toggleStation(this)">
                ${abbr}${mainTag} <small style="color:#94a3b8">(${s})</small>
            </label>
        `;
    }).join('');

    panel.style.display = 'block';
    if (showNotice) showToast(`Đài ${region} hôm nay đã hiển thị. Bỏ trống = đài chính.`, 'info');
}

function toggleStation(cb) {
    if (cb.checked) {
        if (!selectedStations.includes(cb.value)) selectedStations.push(cb.value);
    } else {
        selectedStations = selectedStations.filter(s => s !== cb.value);
    }
}

function confirmSelectedStations() {
    if (selectedStations.length === 0) {
        document.getElementById('station-select-panel').style.display = 'none';
        const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
        const main = getMainStation(region);
        showToast(`Chưa tick → dùng đài chính: ${main.map(s => STATION_ABBR[s] || s).join(', ')}`, 'info');
        return;
    }
    document.getElementById('station-select-panel').style.display = 'none';
    showToast(`Đã chọn ${selectedStations.length} đài: ${selectedStations.map(s => STATION_ABBR[s] || s).join(', ')}`, 'success');
}

// ================= INDEXEDDB ENGINE =================
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("bets")) {
                const betStore = db.createObjectStore("bets", { keyPath: "id", autoIncrement: true });
                betStore.createIndex("group", "group", { unique: false });
                betStore.createIndex("timestamp", "timestamp", { unique: false });
                betStore.createIndex("dateStr", "dateStr", { unique: false });
            }
            if (!db.objectStoreNames.contains("results")) {
                db.createObjectStore("results", { keyPath: "dateStr" });
            }
            if (!db.objectStoreNames.contains("appState")) {
                db.createObjectStore("appState", { keyPath: "key" });
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        request.onerror = (e) => reject("Không thể mở IndexedDB: " + e.target.error);
    });
}

function saveAppDataToDB() {
    if (!dbInstance) return Promise.resolve();
    appStateSaveQueue = appStateSaveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
        let tx;
        try {
            tx = dbInstance.transaction(["appState"], "readwrite");
            const store = tx.objectStore("appState");
            store.put({ key: "groups", value: groups });
            store.put({ key: "activeGroup", value: activeGroup });
            for (const g of groups) {
                if (appData[g]) store.put({ key: `data_${g}`, value: appData[g] });
            }
        } catch (error) {
            reject(error);
            return;
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Không thể lưu dữ liệu'));
        tx.onabort = () => reject(tx.error || new Error('Giao dịch lưu đã bị hủy'));
    }));
    return appStateSaveQueue;
}

async function loadAppDataFromDB() {
    if (!dbInstance) return;
    const readState = (key) => new Promise((resolve, reject) => {
        const tx = dbInstance.transaction(["appState"], "readonly");
        const req = tx.objectStore("appState").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
        req.onerror = () => reject(req.error);
    });

    const savedGroups = await readState('groups');
    if (Array.isArray(savedGroups) && savedGroups.length) groups = savedGroups;
    const [savedActive, ...savedData] = await Promise.all([
        readState('activeGroup'),
        ...groups.map(g => readState(`data_${g}`))
    ]);
    groups.forEach((g, index) => {
        if (savedData[index]) appData[g] = savedData[index];
    });
    if (savedActive) activeGroup = savedActive;
    ensureDataStructure();
}

function ensureDataStructure() {
    groups.forEach(g => {
        if (!appData[g]) {
            initAppDataForGroup(g);
            return;
        }
        if (!appData[g].inputHistory) appData[g].inputHistory = [];
        if (!appData[g].matrix) {
            appData[g].matrix = {
                mt3c: Array(20).fill().map(() => [0, 0, 0]),
                mt2c: Array(20).fill().map(() => [0, 0]),
                mb3c: Array(20).fill().map(() => [0, 0, 0]),
                mb2c: Array(20).fill().map(() => [0, 0]),
            };
        }
        if (!appData[g].totals) {
            appData[g].totals = { mtXac: 0, mtLai: 0, mbXac: 0, mbLai: 0, totalBet: 0, totalWin: 0, net: 0 };
        }
        if (!appData[g].betList) appData[g].betList = [];
        if (!appData[g].winningLogs) appData[g].winningLogs = [];
    });
}

function initAppDataForGroup(g) {
    if (appData[g]) return;
    appData[g] = {
        betList: [],
        inputHistory: [],
        matrix: {
            mt3c: Array(20).fill().map(() => [0, 0, 0]),
            mt2c: Array(20).fill().map(() => [0, 0]),
            mb3c: Array(20).fill().map(() => [0, 0, 0]),
            mb2c: Array(20).fill().map(() => [0, 0]),
        },
        winningLogs: [],
        totals: { mtXac: 0, mtLai: 0, mbXac: 0, mbLai: 0, totalBet: 0, totalWin: 0, net: 0 }
    };
}

// ================= MODAL & TOAST =================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal({
    title = 'Thông Báo',
    body = '',
    isPrompt = false,
    defaultValue = '',
    placeholder = '',
    confirmText = 'Xác Nhận',
    cancelText = 'Hủy Bỏ',
    confirmClass = 'btn-green',
    showCancel = null,
    onConfirm = null,
    onCancel = null,
    wide = false          // true = modal rộng hơn (dùng cho bảng nhiều cột như Lọc/Cắt thông minh)
}) {
    const overlay = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const inputContainer = document.getElementById('modal-input-container');
    const promptInput = document.getElementById('modal-prompt-input');
    const btnContainer = document.getElementById('modal-buttons');

    if (!overlay) return;

    const cardEl = overlay.querySelector('.modal-card');
    if (cardEl) cardEl.style.width = wide ? 'min(920px, 95vw)' : '';

    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = body;

    if (inputContainer && promptInput) {
        if (isPrompt) {
            inputContainer.style.display = 'block';
            promptInput.value = defaultValue;
            promptInput.placeholder = placeholder;
            setTimeout(() => { promptInput.focus(); promptInput.select(); }, 50);
        } else {
            inputContainer.style.display = 'none';
        }
    }

    if (btnContainer) {
        btnContainer.innerHTML = '';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';

        const needsCancel = showCancel !== null ? showCancel : isPrompt;

        if (needsCancel) {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'btn btn-gray';
            btnCancel.style.flex = '1';
            btnCancel.innerText = cancelText;
            btnCancel.onclick = () => {
                overlay.style.display = 'none';
                if (onCancel) onCancel();
            };
            btnContainer.appendChild(btnCancel);
        }

        const btnOk = document.createElement('button');
        btnOk.className = `btn ${confirmClass}`;
        btnOk.style.flex = '1';
        btnOk.innerText = confirmText;
        btnOk.onclick = () => {
            const val = isPrompt && promptInput ? promptInput.value.trim() : true;
            overlay.style.display = 'none';
            if (onConfirm) onConfirm(val);
        };
        btnContainer.appendChild(btnOk);
    }

    overlay.style.display = 'flex';
}

function customAlert(msg, title = "Thông Báo") {
    showModal({ title, body: msg });
}

function customPrompt(title, placeholder, defaultVal, callback) {
    showModal({ title, body: '', isPrompt: true, placeholder, defaultValue: defaultVal, onConfirm: callback });
}

// ================= QUẢN LÝ NHÓM =================
function addNewGroup() {
    customPrompt("Thêm Nhóm Mới", "Nhập tên nhóm...", `Nhóm ${String.fromCharCode(65 + groups.length)}`, (name) => {
        if (!name) return;
        name = name.trim();
        if (groups.includes(name)) return showToast("Tên nhóm này đã tồn tại!", "error");
        groups.push(name);
        initAppDataForGroup(name);
        switchGroup(name);
        updateGrandSummary();
        saveAppDataToDB();
        showToast(`Đã thêm "${name}" thành công!`, "success");
    });
}

function renameGroup(oldName) {
    showModal({
        title: "✏️ Đổi Tên Nhóm",
        body: `Nhập tên mới cho <b>Nhóm ${oldName}</b>:`,
        isPrompt: true,
        defaultValue: oldName,
        placeholder: "Nhập tên mới...",
        confirmText: "Lưu Thay Đổi",
        confirmClass: "btn-green",
        cancelText: "Hủy",
        showCancel: true,
        onConfirm: (newName) => {
            if (!newName) return typeof showToast === 'function' && showToast("Tên nhóm không được để trống!", "error");
            if (newName === oldName) return;
            if (groups.includes(newName)) return typeof showToast === 'function' && showToast("Tên nhóm này đã tồn tại!", "error");

            const idx = groups.indexOf(oldName);
            if (idx === -1) return;

            groups[idx] = newName;
            if (typeof appData !== 'undefined' && appData[oldName]) {
                appData[newName] = appData[oldName];
                delete appData[oldName];
            }

            if (typeof activeGroup !== 'undefined' && activeGroup === oldName) activeGroup = newName;
            if (typeof currentGroup !== 'undefined' && currentGroup === oldName) currentGroup = newName;

            if (typeof renderGroupButtons === 'function') renderGroupButtons();
            if (typeof renderGroupNav === 'function') renderGroupNav();
            if (typeof renderMatrixTable === 'function') renderMatrixTable();
            if (typeof updateGrandSummary === 'function') updateGrandSummary();
            if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

            if (typeof showToast === 'function') showToast(`Đã đổi tên "${oldName}" → "${newName}"`, "success");
        }
    });
}

function deleteGroup(g) {
    if (typeof groups !== 'undefined' && groups.length <= 1) {
        return typeof showToast === 'function' && showToast("Không thể xóa nhóm cuối cùng!", "error");
    }

    showModal({
        title: "⚠️ Xác Nhận Xóa",
        body: `
            <div style="text-align:center; padding:5px 0;">
                <p style="font-size:14px; color:#cbd5e1; margin-bottom:8px;">
                    Bạn có chắc chắn muốn xóa <b style="color:#00f3ff;">Nhóm ${g}</b>?
                </p>
                <p style="color:#f87171; font-size:12.5px;">Toàn bộ dữ liệu nhóm này sẽ mất vĩnh viễn.</p>
            </div>`,
        confirmText: "Xóa Ngay",
        confirmClass: "btn-red",
        cancelText: "Hủy Bỏ",
        showCancel: true,
        onConfirm: () => {
            groups = groups.filter(item => item !== g);
            if (typeof appData !== 'undefined') delete appData[g];
            if (typeof activeGroup !== 'undefined' && activeGroup === g) activeGroup = groups[0];
            if (typeof currentGroup !== 'undefined' && currentGroup === g) currentGroup = groups[0];

            if (typeof renderGroupButtons === 'function') renderGroupButtons();
            if (typeof renderGroupNav === 'function') renderGroupNav();
            if (typeof renderMatrixTable === 'function') renderMatrixTable();
            if (typeof updateGrandSummary === 'function') updateGrandSummary();
            if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

            if (typeof showToast === 'function') showToast(`Đã xóa nhóm ${g}`, "success");
        }
    });
}

// ================= CÁC HÀM HIỆU NĂNG =================
function saveAppDataToDBDebounced() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    }, 350);
}

// Giữ bản thay đổi đang gõ khi chuyển tab/đóng trang. Không render lại ở đây
// để con trỏ trong ô nhập không bị giật.
window.addEventListener('pagehide', () => {
    clearTimeout(saveTimeout);
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        clearTimeout(saveTimeout);
        if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    }
});

let searchTimeout = null;
function onSearchInput(searchTerm) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (typeof filterAndRenderMatrixTable === 'function') {
            filterAndRenderMatrixTable(searchTerm);
        }
    }, 250);
}

// ================= PARSER THÔNG MINH (BẢN ĐẦY ĐỦ) =================
function parseAmount(str) {
    if (!str) return 0;
    str = String(str).toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
    str = str.replace(/ng$/, 'n');

    // 0/5 → 0.5 | 1/2 → 0.5
    if (str.includes('/')) {
        const parts = str.replace(/[kntr]/g, '').split('/');
        if (parts.length === 2 && parts[0] === '0' && /^\d+$/.test(parts[1])) {
            return Number(`0.${parts[1]}`);
        }
        const a = parseFloat(parts[0]) || 0;
        const b = parseFloat(parts[1]) || 1;
        const n = a / b;
        if (str.includes('tr') || str.includes('m')) return n * 1000;
        return n;
    }

    let mul = 1;
    if (str.endsWith('tr') || str.endsWith('m')) {
        mul = 1000;
        str = str.slice(0, -2);
    } else if (str.endsWith('k') || str.endsWith('n')) {
        str = str.slice(0, -1); // n = k
    }

    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    const val = num * mul;
    // 50000 → 50 (k)
    return (val >= 1000 && mul === 1) ? val / 1000 : val;
}

function mapBetType(raw) {
    const t = String(raw || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/\s+/g, '');

    if (/^(bl|blo|baolo|bao|lo)$/.test(t)) return 'bl';
    if (/^(da|da2)$/.test(t)) return 'da';
    // Xác nhận Cocomi (29/08/2026): "Xiên" và "Chéo" là 2 CÁCH TÍNH KHÁC
    // NHAU, không phải 2 tên gọi của cùng 1 thứ như trước đây tưởng nhầm:
    // - "Xiên" = CẢ NHÓM 1 cược duy nhất, đủ HẾT số mới trúng (giữ nguyên ở
    //   'dx', không đổi).
    // - "Chéo" = TÁCH TỪNG CẶP riêng (VD 3 số → 3 cặp), trúng từng phần vẫn
    //   ăn tiền — ĐÚNG cơ chế đang có sẵn ở 'dv' (Đá Vòng), không phải 'dx'.
    if (/^(xien|xuyen|dx)$/.test(t)) return 'dx';
    if (/^(cheo|che)$/.test(t)) return 'dv';
    if (/^(dvong|davong|lienhoan|dv|dlh)$/.test(t)) return 'dv';
    if (/^(xc|xiuchu)$/.test(t)) return 'xc';
    // Đặc biệt / đề / đb / dac biet / gdb
    if (/^(db|de|debiet|dacbiet|dacbit|gdb|dacthuong|dacthuongbiet)$/.test(t)) return 'db';
    // "Đầu Chót" = tên gọi khác của "Đầu Đuôi" (Đầu chót = Đầu + Chót/Đuôi
    // GĐB) — phải bắt TRƯỚC "dau" đứng một mình, không thì "chót" bị rớt,
    // hiểu nhầm thành chỉ mỗi "Đầu" (mất nửa cược).
    if (/^(dc|dd|daucuoi|dauduoi|dauchot)$/.test(t)) return 'dd';
    if (/^(dau)$/.test(t)) return 'dau';
    if (/^(duoi|cuoi|chot)$/.test(t)) return 'duoi';
    // "5 cuối"/"4 cuối" gõ đủ chữ (có cách) → quy về đúng "5c"/"4c" như gõ tắt.
    // "4 chót" (từ địa phương, khách Miền Bắc hay gõ) cũng là "4 Cuối"
    // (đã bỏ nghĩa "4 Càng" cũ) — chữ "chót" ở đây khác nghĩa "chót"=Đuôi
    // đứng MỘT MÌNH phía dưới, chỉ tính khi đi liền số "4" phía trước.
    if (/^(4c|4cuoi|4chot)$/.test(t)) return '4c';
    if (/^(5c|5cuoi)$/.test(t)) return '5c';
    if (/^(10c|10locuoi)$/.test(t)) return '10cuoi';
    // Bổ sung theo xác nhận Cocomi: "14 Cuối" (riêng Miền Bắc), "5 Đầu"/
    // "6 Đầu" (riêng Trung/Nam) — phải bắt "12cuoi" TRƯỚC "12d" (khác nhau
    // hoàn toàn: "12 Cuối" = G4..ĐB, "12 Đầu"/"12d" = G7..G4).
    if (/^(14c|14cuoi)$/.test(t)) return '14cuoi';
    if (/^(12cuoi)$/.test(t)) return 'g4g3g2g1db';
    if (/^(5dau)$/.test(t)) return 'g7g6g5';
    if (/^(6dau)$/.test(t)) return 'g8g7g6g5';
    // Cocomi xác nhận khách Trung/Nam hay gõ tắt "5d"/"6d" (đi kèm "3c"/"2c")
    // thay vì gõ đủ "5 đầu"/"6 đầu" — cùng nghĩa, quy về chung 1 mã.
    if (t === '5d') return 'g7g6g5';
    if (t === '6d') return 'g8g7g6g5';
    if (t === 'g4g3g2g1db') return 'g4g3g2g1db';
    if (t === 'g7g6g5') return 'g7g6g5';
    if (t === 'g8g7g6g5') return 'g8g7g6g5';
    if (t === '14cuoi') return '14cuoi';
    if (t === '10lo') return '10lo';
    if (/^(3d|8d|10d|12d|13d)$/.test(t)) return t;
    // "g4lo6" = chỉ đúng SỐ THỨ 6 trong danh sách Giải 4 (theo đúng thứ tự
    // liệt kê trong bảng KQXS) — không phải bao hết các số của Giải 4. Nhận
    // chung mọi tổ hợp giải+vị trí (không chỉ g4lo5/g4lo7/g6lo1 như trước).
    const gLo = t.match(/^g([1-8])lo(\d+)$/);
    if (gLo) return `g${gLo[1]}lo${gLo[2]}`;
    if (/^(g6g4g3|6g4g3)$/.test(t)) return 'g6g4g3';
    if (/^(g8g7g6g5g4|13d)$/.test(t)) return t === '13d' ? '13d' : 'g8g7g6g5g4';
    if (/^(g7g6g5g4|12d)$/.test(t)) return t === '12d' ? '12d' : 'g7g6g5g4';
    if (t === 'g3g2g1db') return 'g3g2g1db';
    if (/^(g7g6|g6g5|g5g4|g3g2|g2g1|g1db)$/.test(t)) return t;
    if (/^(g6g4|6g4)$/.test(t)) return 'g6g4';
    if (/^(g4g3|4g3)$/.test(t)) return 'g4g3';
    if (t === 'g6g3' || t === '6g3') return 'g6g3';
    if (/^(3c)$/.test(t)) return '3c';
    if (/^(2c)$/.test(t)) return '2c';
    if (/^(c2|2cang|2cangrieng)$/.test(t)) return 'c2';
    if (/^(c3|3cang|3cangrieng)$/.test(t)) return 'c3';

    // Chẵn/Lẻ theo cặp (đầu-đuôi) và 12 Con Giáp — dùng chung dàn số có sẵn
    // trong PAIR_SETS_NORM / ALL_ZODIAC_NUMS (xem hàm add() bên dưới).
    if (/^(chanchan)$/.test(t)) return 'chan_chan';
    if (/^(lele)$/.test(t)) return 'le_le';
    if (/^(chanle)$/.test(t)) return 'chan_le';
    if (/^(lechan)$/.test(t)) return 'le_chan';
    if (/^(giap|congiap|12congiap)$/.test(t)) return 'giap';

    // 12 con giáp riêng lẻ — "dậu"/"dê" bỏ dấu trùng "dau"=Đầu/"de"=Đề (từ
    // khóa cược đã có sẵn) nên KHÔNG nhận 2 tên đó ở đây, dùng "ga"/"mui" thay.
    if (/^(ty|chuot)$/.test(t)) return 'ty';
    if (/^(suu|trau)$/.test(t)) return 'suu';
    if (/^(dan|ho|cop)$/.test(t)) return 'dan';
    if (/^(mao|meo)$/.test(t)) return 'mao';
    if (/^(thin|rong)$/.test(t)) return 'thin';
    if (/^(ran)$/.test(t)) return 'ran';
    if (/^(ngo|ngua)$/.test(t)) return 'ngo';
    if (/^(mui)$/.test(t)) return 'mui';
    if (/^(than|khi)$/.test(t)) return 'than';
    if (/^(ga)$/.test(t)) return 'ga';
    if (/^(tuat|cho)$/.test(t)) return 'tuat';
    if (/^(hoi|heo|lon)$/.test(t)) return 'hoi';

    // Tên giải bằng chữ (miền Nam/Trung quen gọi "giải nhất/nhì/ba..." hơn
    // "g1/g2/g3") — quy về đúng key "g1".."g8" đã có sẵn luật/tỷ lệ.
    if (/^gnhat$/.test(t)) return 'g1';
    if (/^gnhi$/.test(t)) return 'g2';
    if (/^gba$/.test(t)) return 'g3';
    if (/^gtu$/.test(t)) return 'g4';
    if (/^gnam$/.test(t)) return 'g5';
    if (/^gsau$/.test(t)) return 'g6';
    if (/^gbay$/.test(t)) return 'g7';
    if (/^gtam$/.test(t)) return 'g8';

    const g = t.match(/^g([1-8])$/);
    if (g) return 'g' + g[1];
    // "giải7"/"giải 7" gõ đủ chữ (đã bỏ dấu ở trên nên còn "giai7") → quy về
    // đúng "g7" như gõ tắt.
    const giai = t.match(/^giai([1-8])$/);
    if (giai) return 'g' + giai[1];
    return 'bl';
}

// Quy các mã CŨ/viết tắt trùng công thức về đúng 1 mã DUY NHẤT để hiển thị
// (dropdown, badge, ghi chú...) — không đổi gì trong cách tính tiền, vì
// getPrizeCount/getBetTypeTiers tra theo BET_TYPES nào cũng ra cùng kết quả
// (đã kiểm tra: '5c' và 'g3g2g1db' cho đúng cùng {MB:10,MT:5,MN:5}, tương
// tự '12d'/'g7g6g5g4' và '13d'/'g8g7g6g5g4') — chỉ gộp DANH SÁCH HIỂN THỊ
// cho gọn, dữ liệu cũ đã lỡ lưu mã viết tắt vẫn tính tiền đúng y hệt.
const DUPLICATE_TYPE_DISPLAY_MAP = {
    'bl': '2c',
    '5c': 'g3g2g1db',
    '4c': 'g3g2g1db',
    '12d': 'g7g6g5g4',
    '13d': 'g8g7g6g5g4'
};

function getManualTypeKey(type) {
    return DUPLICATE_TYPE_DISPLAY_MAP[type] || type;
}

// Chẵn lẻ / 12 con giáp KHÔNG PHẢI là "loại cược" thật — đây chỉ là dàn số
// CÓ SẴN để bung ra khi gõ đúng từ khóa (giống "đảo"/"20 đến 30"), bản chất
// tiền tính vẫn là Bao Lô 2C (mọi dàn này đều ra số 2 chữ số). Trước đây lỡ
// đưa 17 mã này vào DANH SÁCH CHỌN TAY khiến người dùng tưởng đây là loại
// cược riêng, chọn tay được — sai. Quy về '2c' CHỈ khi hiện DROPDOWN chọn
// loại (để dropdown gọn, không liệt kê 17 mục thừa); ghi chú (note) VẪN giữ
// nguyên tên gốc ("Hợi (Heo)", "Chẵn Chẵn"...) qua getManualTypeKey() ở nơi
// khác — không dùng map này, để không mất thông tin nguồn gốc của dòng cược.
const PATTERN_TYPE_DROPDOWN_FALLBACK = {
    chan_chan: '2c', le_le: '2c', chan_le: '2c', le_chan: '2c', giap: '2c',
    ty: '2c', suu: '2c', dan: '2c', mao: '2c', thin: '2c', ran: '2c',
    ngo: '2c', mui: '2c', than: '2c', ga: '2c', tuat: '2c', hoi: '2c',
    // "Dãy số" (VD "20 đến 30") CÙNG PHE với đảo/con giáp — chỉ là cách bung
    // số nhanh, không phải 1 loại cược riêng (xem sửa lỗi ở onInputSmartRow:
    // trước đây lỡ ép cứng thành 'day_so' — 1 mã có tỷ lệ CỐ ĐỊNH kiểu 2C —
    // khiến dãy số 3 chữ số bị tính nhầm giá 2C thay vì đúng giá 3C).
    day_so: '2c'
};

function getDropdownDisplayType(type) {
    return PATTERN_TYPE_DROPDOWN_FALLBACK[type] || getManualTypeKey(type);
}

// Các loại cược tạm ẩn khỏi danh sách chọn (vẫn hiện đúng nếu dòng cược CŨ đã
// lỡ chọn từ trước, chỉ chặn chọn MỚI):
// - '3d'/'8d'/'10d': chưa xác định được đúng giải tính trúng.
// - '7lo'/'10lo'/'12lo'/'14lo'/'16lo': đây thực ra là "Lô trượt xiên" (thắng
//   khi TẤT CẢ số đã chọn đều KHÔNG về) — cơ chế thắng/thua hoàn toàn khác
//   với mọi loại cược còn lại trong app (vốn tính theo "khớp số"), và một
//   lượt cược "trượt xiên" là MỘT NHÓM số cùng ăn/thua chung chứ không phải
//   từng dòng riêng lẻ như cấu trúc dữ liệu hiện tại — cần thiết kế lại hẳn,
//   không thể vá nhanh trong prizeMatchesBet.
// - 'g4lo5'/'g4lo7'/'g6lo1': số giải ghi không khớp cơ cấu giải thật của bất
//   kỳ miền nào (G4: MB có 4 giải, MT/MN có 7 giải — không có "5"), và trùng
//   lặp với cược giải riêng G4/G5/G6 vốn đã tính đúng số lô theo từng miền.
// - 'dau_db': "2 số đầu của GĐB" là so khớp một PHẦN của chính số ĐB (không
//   phải so khớp cả giải) — cơ chế khác hẳn, chưa cài đúng.
const HIDDEN_BET_TYPES = [
    '3d', '8d', '10d',
    '7lo', '10lo', '12lo', '14lo', '16lo',
    'g4lo5', 'g4lo7', 'g6lo1',
    'dau_db'
];

// Các loại này TÊN GỐC ghi chung chung cả 2 miền (VD "Đầu (G8 / G7)") vì
// bản thân giải áp dụng phụ thuộc miền — nhưng lúc hiện dropdown chọn loại
// thì MIỀN ĐÃ ĐƯỢC CHỌN SẴN từ trước rồi (đài đã chọn theo đúng miền đang
// nạp), không cần chờ đoán — nên hiện thẳng ĐÚNG 1 giải áp dụng cho miền đó
// luôn, đỡ phải nhớ quy tắc B/T/N mới hiểu được tên gọi.
// Giá trị là HÀM (nhận vào mảng tiers đã tra theo miền) chứ không phải chữ
// cố định — vì '5c'/'g3g2g1db' ("Cuối") còn đổi luôn SỐ LƯỢNG giải gộp theo
// miền (Trung/Nam 4 giải = "5 Cuối", Bắc 3 giải = "4 Cuối"), không chỉ đổi
// SỐ LÔ như "Đầu"/"Đầu Đuôi"/"Xỉu Chủ" (tên gốc không đổi, chỉ đổi giải).
const REGIONAL_TYPE_BASE_NAME = {
    dau: () => 'Đầu',
    dd: () => 'Đầu Đuôi',
    xc: () => 'Xỉu Chủ',
    xc_dau: () => 'Xỉu Chủ Đầu',
    // Số ghi trong tên ("5 Cuối"/"4 Cuối") là SỐ LÔ thật (getPrizeCount),
    // KHÔNG phải số giải gộp (tiers.length) — VD Trung/Nam gộp 4 giải
    // (G3+G2+G1+ĐB) nhưng ra 5 LÔ vì Giải 3 tự nó có 2 số.
    '5c': (tiers, region) => `${getPrizeCount('g3g2g1db', region)} Cuối`,
    g3g2g1db: (tiers, region) => `${getPrizeCount('g3g2g1db', region)} Cuối`
};

// Ghi chú (note) lưu vào item phải đúng theo MIỀN — không dùng thẳng
// BET_TYPES[key].name (chữ cố định, không phân biệt miền) cho các loại có
// tên đổi theo miền (VD '4c'/'5c'/'g3g2g1db': Trung/Nam "5 Cuối" 4 giải,
// Bắc "4 Cuối" chỉ 3 giải — ghi lộn miền là sai hẳn ý nghĩa cược).
function getRegionAwareTypeName(type, region) {
    const key = getManualTypeKey(type);
    if (region && REGIONAL_TYPE_BASE_NAME[key] && typeof getBetTypeTiers === 'function') {
        const tiers = getBetTypeTiers(key, region);
        if (Array.isArray(tiers) && tiers.length) {
            const baseName = REGIONAL_TYPE_BASE_NAME[key](tiers, region);
            return `${baseName} (${describeTierOnly(tiers)})`;
        }
    }
    return BET_TYPES[key]?.name || String(type).toUpperCase();
}

function getManualBetTypeOptions(selectedType, region) {
    const groups = [
        ['Bao lô theo số', ['2c', '3c']],
        ['Đặc biệt', ['db']],
        ['Càng riêng', ['c2', 'c3']],
        ['Giải riêng', ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8']],
        // '5c'/'4c'/'12d'/'13d' (mã viết tắt, tên không tự ghi rõ giải) đã BỎ
        // khỏi đây — cùng công thức y hệt 'g3g2g1db'/'g7g6g5g4'/'g8g7g6g5g4'
        // bên dưới (tên đã ghi rõ sẵn) nên không cần hiện 2 lựa chọn cho cùng
        // 1 kết quả. Dữ liệu CŨ lỡ lưu '5c'/'4c'/'12d'/'13d' vẫn tính tiền
        // đúng bình thường, chỉ tự hiển thị quy về mã rõ ràng.
        // TOÀN BỘ họ "Cuối" (4c/5c, 10 Cuối, 12 Cuối, 14 Cuối) gom CHUNG 1
        // nhóm để dễ thấy — trước đây '4c'/'5c' (g3g2g1db) và '12cuoi'
        // (g4g3g2g1db) bị để lẫn trong nhóm "Cược tổng hợp" chung với nhiều
        // mã khác không liên quan, khiến "4 Cuối" (tên hiện theo Miền Bắc của
        // CÙNG 1 mã g3g2g1db — Miền Trung/Nam hiện "5 Cuối") rất khó tìm thấy
        // dù thực ra đã có sẵn. Tên hiển thị theo miền (REGIONAL_TYPE_BASE_NAME).
        ['Cuối GĐB (theo giải)', ['g3g2g1db', '10cuoi', 'g4g3g2g1db', '14cuoi']],
        // Họ "Đầu" gom chung tương tự — 5 Đầu/6 Đầu (Trung/Nam) và 12 Đầu/13
        // Đầu (mọi miền) đều là "tính từ giải X xuống thấp dần", để cạnh nhau
        // cho dễ so sánh/chọn đúng.
        ['Đầu (theo giải)', ['g7g6g5', 'g8g7g6g5', 'g7g6g5g4', 'g8g7g6g5g4']],
        ['Đầu / Lô theo giải', ['3d', '8d', '10d', '7lo', '10lo', '12lo', '14lo', '16lo', 'g4lo5', 'g4lo7', 'g6lo1']],
        // "Dãy số"/'day_so' KHÔNG có ở đây nữa — không phải 1 loại cược thật
        // (xem PATTERN_TYPE_DROPDOWN_FALLBACK), chỉ là cách bung số nhanh
        // giống "đảo"/con giáp, luôn đi kèm 1 loại thật (2C/3C/Đá/1 giải) chứ
        // không tự nó là 1 lựa chọn riêng.
        ['Đá', ['da', 'dx', 'dv']],
        ['Giải kết hợp khác', SELF_DESCRIBING_TIER_TYPES.filter(k => !['g3g2g1db', '10cuoi', 'g4g3g2g1db', '14cuoi', 'g7g6g5', 'g8g7g6g5', 'g7g6g5g4', 'g8g7g6g5g4'].includes(k))],
        ['Đầu / Đuôi / Xỉu chủ', ['dau', 'duoi', 'dd', 'xc', 'xc_dau', 'xc_duoi', 'dau_db']]
        // Chẵn lẻ / 12 con giáp (chan_chan, giap, ty, ran...) KHÔNG có trong
        // danh sách chọn tay — đây không phải "loại cược" thật, chỉ là dàn
        // số có sẵn bung ra khi gõ đúng từ khóa (y hệt "đảo"), tiền vẫn tính
        // như Bao Lô 2C. Xem PATTERN_TYPE_DROPDOWN_FALLBACK/getDropdownDisplayType.
    ];
    const groupsHtml = groups.map(([label, keys]) => {
        const options = keys
            .filter(key => BET_TYPES[key] && (!HIDDEN_BET_TYPES.includes(key) || key === selectedType))
            // Loại nào KHÔNG áp dụng cho miền đang chọn (VD "14 Cuối" chỉ có
            // ở Bắc, "5/6 Đầu" chỉ có ở Trung/Nam — số lô ghi 0 cho miền
            // không áp dụng) thì ẩn luôn, đỡ liệt kê thứ không chọn được.
            .filter(key => !region || !BET_TYPES[key].prizes || BET_TYPES[key].prizes[region] !== 0 || key === selectedType)
            .map(key => {
                let displayName = BET_TYPES[key].name;
                // Đã biết miền (region) → thay tên chung chung bằng ĐÚNG 1
                // giải áp dụng cho miền đó (VD Trung/Nam: "Đầu (Giải 8)",
                // Bắc: "Đầu (Giải 7)") thay vì luôn ghi cả 2 "(G8 / G7)".
                if (region && REGIONAL_TYPE_BASE_NAME[key] && typeof getBetTypeTiers === 'function') {
                    const tiers = getBetTypeTiers(key, region);
                    if (Array.isArray(tiers) && tiers.length) {
                        const baseName = REGIONAL_TYPE_BASE_NAME[key](tiers, region);
                        displayName = `${baseName} (${describeTierOnly(tiers)})`;
                    }
                }
                return `<option value="${key}" ${selectedType === key ? 'selected' : ''}>${escapeHtml(displayName)}</option>`;
            }).join('');
        return options ? `<optgroup label="${label}">${options}</optgroup>` : '';
    }).join('');

    // "Giải N - Lô M" (VD "Giải 5 - Lô 3") — chọn ĐÚNG 1 vị trí cụ thể trong
    // 1 giải nhiều lô (xem describeTierOnly/prizeMatchesBet/getPrizeCount —
    // đã hỗ trợ sẵn, chỉ thiếu chỗ CHỌN TAY). Không nằm trong BET_TYPES
    // (không phải mã cố định — sinh động theo ĐÚNG số lô thật của giải đó
    // THEO TỪNG MIỀN, VD Giải 5 Trung/Nam 1 lô nên không có, Giải 5 Bắc 6 lô
    // nên có "Lô 1".."Lô 6") nên xây RIÊNG, không dùng chung pipeline lọc
    // theo BET_TYPES[key] ở trên. THIẾU nhóm này thì <select> không có
    // option nào khớp mã 'g{n}lo{m}' — trình duyệt tự hiện lựa chọn ĐẦU TIÊN
    // (Bao Lô 2C) dù dữ liệu thật vẫn đang là 'g{n}lo{m}', khiến người xem
    // tưởng nhầm đang chọn Bao Lô 2C — và nếu có thao tác nào đó đọc lại
    // .value của <select> này để ghi ngược vào dữ liệu (VD đồng bộ ô Nhập Tay
    // sau khi gõ số) thì betType THẬT SỰ bị ghi đè thành '2c' sai hẳn, kéo
    // theo tiền tính sai theo công thức Bao Lô thay vì đúng 1 lô như phải có.
    let gLoOptions = '';
    if (region) {
        for (let n = 1; n <= 8; n++) {
            const giaiKey = 'g' + n;
            if (!BET_TYPES[giaiKey] || !BET_TYPES[giaiKey].prizes || BET_TYPES[giaiKey].prizes[region] === 0) continue;
            const maxLo = (typeof getPrizeCount === 'function') ? getPrizeCount(giaiKey, region) : 1;
            // Giải chỉ có 1 lô (VD Giải 1, hay Giải 5/7/8 Trung/Nam) thì chọn
            // thẳng "Giải N" ở nhóm "Giải riêng" phía trên là đủ, không cần
            // tách "Lô 1" dư thừa (chỉ có đúng 1 lựa chọn thì không phải chọn gì).
            if (!(maxLo > 1)) continue;
            for (let m = 1; m <= maxLo; m++) {
                const key = `g${n}lo${m}`;
                gLoOptions += `<option value="${key}" ${selectedType === key ? 'selected' : ''}>Giải ${n} - Lô ${m}</option>`;
            }
        }
    }
    const gLoGroupHtml = gLoOptions ? `<optgroup label="Giải nhiều lô (chọn đúng vị trí)">${gLoOptions}</optgroup>` : '';

    return groupsHtml + gLoGroupHtml;
}

function extractNums(str) {
    if (!str) return [];
    // Tiền không phải số cược: 10k, 10ng, x 50, =100, :100.
    const source = String(str)
        .replace(/\b\d+(?:[.,/]\d+)?\s*(?:k|n|ng|tr|m|c)\b/gi, ' ')
        .replace(/([=:]|\bx\s*)\s*\d+(?:[.,/]\d+)?\b/gi, '$1 ');
    return source.match(/\b\d{2,4}\b/g) || [];
}

function digitPermutations(numStr) {
    const chars = String(numStr).split('');
    if (chars.length < 2) return [numStr];
    const out = new Set();
    (function permute(arr, current) {
        if (!arr.length) { out.add(current.join('')); return; }
        for (let i = 0; i < arr.length; i++) {
            permute(arr.slice(0, i).concat(arr.slice(i + 1)), current.concat(arr[i]));
        }
    })(chars, []);
    return [...out];
}

// Cú pháp khách gõ tắt thường gặp: "SỐ.SỐ.LOẠI.TIỀN.SỐ.LOẠI.TIỀN..." — SỐ
// đứng TRƯỚC loại cược (VD "935.347.db.2n"), khác thứ tự "loại trước số"
// mà bản cũ (parseDottedBetLineOld, không còn dùng) giả định — nên bản cũ
// ÂM THẦM LÀM RỚT hoặc lặp nhầm số khi có từ 2 cụm loại cược trở lên trên
// một dòng. Bản này quét theo TOKEN, không quan tâm thứ tự số/loại trước
// sau, chỉ flush khi gặp TIỀN — nên xử lý đúng cả 2 kiểu viết. Hỗ trợ thêm:
// - Gộp nhiều loại dùng chung 1 khoản tiền bằng dấu "+": "g5+g7", "g1+db"
// - Không có số mới trước 1 cụm loại+tiền → dùng lại số của cụm gần nhất
//   (VD "...db.10n+g7.3n" = 10n cho db, RỒI 3n cho g7, CÙNG dải số đó)
// - "dao"/"đảo": nhân bản số đứng trước thành TẤT CẢ hoán vị chữ số
// - Chữ cái đơn "d"/"c" = viết tắt Đầu/Đuôi (chỉ trong cú pháp chấm này)
function parseDottedBetLine(rawLine, region) {
    let line = String(rawLine || '').replace(/[Đđ]/g, 'd').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/,/g, '.'); // dấu phẩy khách gõ nhầm cũng coi như dấu chấm
    // Ghép "chẵn chẵn"/"chẵn lẻ"/"lẻ lẻ"/"lẻ chẵn" (2 chữ, cách nhau khoảng
    // trắng) thành 1 token liền — tokenizer bên dưới tách theo khoảng trắng/
    // dấu chấm nên nếu để nguyên 2 chữ, mỗi chữ "chan"/"le" đứng riêng không
    // khớp TYPE_RE nào cả, bị coi là "token không xác định" rồi BỎ QUA hoàn
    // toàn — khiến cụm cược "cả cụm" này mất trắng loại, tự động DÙNG LẠI
    // loại+số của cụm ngay TRƯỚC ĐÓ (sai hẳn, không phải ý khách).
    line = line.replace(/\b(chan|le)\s+(chan|le)\b/gi, '$1$2');
    line = line.replace(/\b(?:12\s*)?con\s*giap\b/gi, 'giap');

    // Cú pháp "(50s x 55k)" — khách tự ghi kèm SỐ LƯỢNG để tự đối chiếu (VD
    // "...90 ( 50s x 55k)." = 50 số phía trước, mỗi số 55k). "50s" không phải
    // lệnh riêng, chỉ để đối chiếu — quy về đúng "55k" để tokenizer bên dưới
    // nhận như tiền bình thường. Đếm lại đúng số THẬT SỰ đứng trước ngoặc đó
    // (kể từ ngoặc trước, nếu có) — lệch với số khách ghi thì báo ngay, tránh
    // tính sai tiền hàng loạt vì gõ nhầm 1 số mà không ai để ý.
    let lastPriceClauseEnd = 0;
    line = line.replace(/\(\s*(\d+)\s*s\s*x\s*([\d.,/]+(?:ng|tr|k|n|m)?)\s*\)/gi, (full, declaredCount, price, offset, wholeStr) => {
        const segment = wholeStr.slice(lastPriceClauseEnd, offset);
        lastPriceClauseEnd = offset + full.length;
        const actualCount = (segment.match(/\b\d{2,4}\b/g) || []).length;
        if (Number(declaredCount) !== actualCount && typeof showToast === 'function') {
            showToast(`⚠️ Ghi "${declaredCount}s" nhưng đếm được ${actualCount} số thật — kiểm tra lại kẻo tính sai tiền`, 'error');
        }
        return ` ${price} `;
    });

    const tokens = line.split(/[.\s+]+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length < 4) return null;

    // "g[1-8]lo[số]" (VD "g3lo1"/"g4lo2") = chỉ đúng 1 vị trí cụ thể trong 1
    // giải (xem describeTierOnly/prizeMatchesBet/getPrizeCount — đã hỗ trợ
    // sẵn mọi tổ hợp giải+vị trí, tính đúng 1 lô, KHÔNG cần thêm code riêng
    // cho từng giải) — trước đây thiếu trong TYPE_RE của cú pháp nhiều dòng
    // (chấm phân cách) nên các dòng kiểu "G3lo1. Hcm. 12.21.23...(50s x 55k)"
    // bị rớt hẳn, không nhận ra "g3lo1" là loại cược hợp lệ.
    const TYPE_RE = /^(g[1-8]lo\d+|g[1-8]|4c|5c|10c|10locuoi|10cuoi|db|de)$/i;
    // Nhóm "cả cụm" (chẵn/lẻ theo cặp, 12 con giáp — đã ghép liền ở bước
    // trên) có SẴN dàn số cố định riêng (PATTERN_TYPE_NUMS), không cần
    // khách gõ tay số nào — nhận diện được khi XỬ LÝ token thật (isTypeToken)
    // nhưng CỐ TÌNH không tính vào "typeTokenCount" gate bên dưới: nhiều chữ
    // ở đây (heo/ga/cho/ho...) trùng với tên gọi khác đã có sẵn TRONG chính
    // TYPE_RE (VD "Db. Heo x 50k" — tierOnly giới hạn về Đặc Biệt, xử lý ở
    // hàm chính parseSmartLottoText) — nếu tính vào gate sẽ khiến dòng đó bị
    // hàm NÀY nuốt mất trước, làm mất luôn tierOnly (hàm này chưa hiểu khái
    // niệm tierOnly).
    const PATTERN_TOKEN_RE = /^(chanchan|chanle|lele|lechan|giap|chuot|trau|cop|meo|rong|ran|ngua|mui|khi|tuat|cho|hoi|heo|ty|suu|dan|ho|mao|thin|ngo|than|ga)$/i;
    const isTypeToken = t => TYPE_RE.test(t) || PATTERN_TOKEN_RE.test(t) || t === 'd' || t === 'c';
    const isDaoToken = t => t === 'dao';
    const isAmountToken = t => /^\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)$/i.test(t);
    const isNumberToken = t => /^\d{2,4}$/.test(t);

    // Bắt buộc có ít nhất 1 từ khóa loại cược "chắc chắn" (không chỉ dựa vào
    // "d"/"c" đơn lẻ vốn dễ trùng ký tự ngẫu nhiên), CỘNG THÊM hoặc >=2 mốc
    // loại/đảo (cú pháp nhiều cụm, mỗi cụm tự ghi lại loại — VD "G7. 12 1k.
    // G8. 34 2k") HOẶC >=2 mốc tiền (cú pháp 1 loại DÙNG CHUNG cho nhiều
    // nhóm giá khác nhau — VD "G3lo1. Hcm. 12.21...90 (50s x 55k). 00.01...37
    // (18s x 25k)." — chỉ ghi loại 1 lần, nhóm số sau tự dùng lại loại đó qua
    // "lastTypes" bên dưới) — thiếu vế sau thì dòng này bị coi là dòng
    // thường, rớt hẳn không nhận "g3lo1" dù đã có trong TYPE_RE.
    const hasStrongType = tokens.some(t => TYPE_RE.test(t));
    // Gate CHỈ đếm loại "chắc chắn" (TYPE_RE gốc) + đảo — KHÔNG tính nhóm
    // "cả cụm" (xem giải thích PATTERN_TOKEN_RE phía trên), để không đổi
    // hành vi ROUTING của các dòng vốn đã hoạt động đúng qua hàm chính.
    const typeTokenCount = tokens.filter(t => TYPE_RE.test(t) || isDaoToken(t)).length;
    const amountTokenCount = tokens.filter(isAmountToken).length;
    if (!hasStrongType || (typeTokenCount < 2 && amountTokenCount < 2)) return null;

    const resolveType = t => {
        if (t === 'd') return 'dau';
        if (t === 'c') return 'duoi';
        return mapBetType(t);
    };

    const items = [];
    let currentNumbers = [];
    let lastNumbers = [];
    let pendingTypes = [];
    let lastTypes = [];
    let pendingDao = false;
    let clauseIndex = 0;

    tokens.forEach(tok => {
        if (isDaoToken(tok)) { pendingDao = true; return; }
        if (isTypeToken(tok)) { pendingTypes.push(resolveType(tok)); return; }
        if (isAmountToken(tok)) {
            const amount = parseAmount(tok);
            const numbersToUse = currentNumbers.length ? currentNumbers : lastNumbers;
            // Không có loại cược MỚI trước cụm này (VD "...db. 2k. 339. 993. 1k")
            // → dùng lại loại cược gần nhất, đối xứng với việc dùng lại SỐ gần
            // nhất khi cụm không có số mới. Thiếu chỗ này thì cụm cuối cùng của
            // dòng nhiều loại cược dễ bị RỚT hẳn nếu quên gõ lại tên loại.
            const typesToUse = pendingTypes.length ? pendingTypes : lastTypes;
            // Loại "cả cụm" (chan_chan/giap/12 con giáp riêng lẻ...) có SẴN
            // dàn số cố định riêng (PATTERN_TYPE_NUMS) — không cần khách gõ
            // số nào cả, nên không được bắt buộc "numbersToUse.length > 0"
            // như các loại thường (thiếu chỗ này thì cụm "chan chan, chan le
            // x 85k" đứng SAU 1 dòng khác trong CÙNG tin nhắn sẽ bị rớt điều
            // kiện, tự động dùng lại nhầm SỐ+LOẠI của dòng ngay trước đó).
            const hasPatternType = typesToUse.some(t => PATTERN_TYPE_NUMS[t]);
            if (amount > 0 && typesToUse.length && (numbersToUse.length || hasPatternType)) {
                typesToUse.forEach(type => {
                    const ownNums = PATTERN_TYPE_NUMS[type];
                    const expanded = ownNums
                        ? ownNums
                        : (pendingDao ? [...new Set(numbersToUse.flatMap(n => digitPermutations(n)))] : numbersToUse);
                    if (!expanded.length) return;
                    const linkId = `group-${clauseIndex}`;
                    // "g3lo1" ghi chú rõ "Giải 3 (Lô 1)" thay vì in hoa thô
                    // "G3LO1" — dễ đối chiếu hơn khi nhìn lại Bảng Chi Tiết.
                    const noteText = /^g[1-8]lo\d+$/.test(type)
                        ? describeTierOnly([type])
                        : (ownNums ? getRegionAwareTypeName(type, region) : type.toUpperCase());
                    expanded.forEach(number => {
                        const item = createItem(number, amount, region, type, noteText);
                        item.linkId = linkId;
                        items.push(item);
                    });
                    clauseIndex++;
                });
                lastNumbers = numbersToUse;
                lastTypes = typesToUse;
            }
            currentNumbers = [];
            pendingTypes = [];
            pendingDao = false;
            return;
        }
        if (isNumberToken(tok)) { currentNumbers.push(tok); return; }
        // Token không xác định được nghĩa (VD mảnh dư kiểu "+1+") — bỏ qua,
        // không đoán liều số tiền/số cược để tránh sai lệch tiền thật.
    });

    return items.length ? items : null;
}

function parseDottedBetLineOld(rawLine, region) {
    const line = String(rawLine || '').replace(/[Đđ]/g, 'd').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parts = line.split(/\s*\.\s*/).map(part => part.trim()).filter(Boolean);
    if (parts.length < 4 || parts.filter(part => /^(?:g[1-8]|4c|5c|10c|10lo\s*cuoi|db|de)\b/.test(part)).length < 2) {
        return null;
    }

    const items = [];
    let currentType = '';
    let currentNumbers = [];
    let currentAmount = 0;
    let previousNumbers = [];
    let groupIndex = 0;

    const flush = () => {
        if (!currentType || currentAmount <= 0) return;
        const numbers = currentNumbers.length ? currentNumbers : previousNumbers;
        if (!numbers.length) return;
        numbers.forEach(number => {
            const item = createItem(number, currentAmount, region, currentType, currentType.toUpperCase());
            item.linkId = `group-${groupIndex}`;
            items.push(item);
        });
        previousNumbers = [...numbers];
        groupIndex++;
    };

    parts.forEach(part => {
        const compactPart = part.replace(/\s+/g, '');
        if (/^(db|de)$/.test(compactPart)) {
            flush();
            currentType = 'db';
            currentNumbers = [];
            currentAmount = 0;
            return;
        }
        const typeMatch = part.match(/^(g[1-8]|4c|5c|10c|10lo\s*cuoi|db|de)\b/i);
        if (typeMatch) {
            flush();
            currentType = /^(db|de)\b/i.test(part) ? 'db' : mapBetType(typeMatch[1]);
            currentNumbers = [];
            currentAmount = 0;
            currentNumbers.push(...extractNums(part.slice(typeMatch[0].length)));
            return;
        }

        const amountMatch = part.match(/^(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m))$/i);
        if (amountMatch) {
            currentAmount = parseAmount(amountMatch[1]);
            return;
        }

        if (currentType && currentAmount <= 0) {
            currentNumbers.push(...extractNums(part));
        } else if (currentType && currentAmount > 0) {
            const nextNumbers = extractNums(part);
            if (nextNumbers.length) {
                flush();
                currentNumbers = nextNumbers;
                currentAmount = 0;
            }
        }
    });
    flush();

    return items.length ? items : null;
}

function parseCompactGroupedBetLine(rawLine, region) {
    const normalized = String(rawLine || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const totalMatch = normalized.match(/\bok\s*[=:]\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)/i);
    if (!totalMatch || !/g6g3/.test(normalized)) return null;

    const body = normalized.slice(0, totalMatch.index).replace(/\s+/g, '');
    const match = body.match(/^(\d{2,4})\.(\d{2,4})g6g3\.(\d{2,4})db(\d+(?:[.,]\d+)?(?:k|n|m)?)$/i);
    if (!match) return null;

    const totalAmount = parseAmount(totalMatch[1]);
    const dbAmount = parseAmount(match[4]);
    const remainingAmount = totalAmount - dbAmount;
    if (totalAmount <= 0 || dbAmount <= 0 || remainingAmount <= 0) return null;

    const numbers = [match[1], match[2]];
    const g6g3LotCount = getPrizeCount('g6g3', region);
    const perNumberAmount = remainingAmount / (numbers.length * g6g3LotCount);
    const items = numbers.map(number => createItem(number, perNumberAmount, region, 'g6g3', 'G6G3'));
    const dbItem = createItem(match[3], dbAmount, region, 'db', 'DB');
    const linkId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    items.forEach(item => { item.linkId = linkId; });
    dbItem.linkId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return [...items, dbItem];
}

function detectRegionFromText(raw, fallback) {
    const t = String(raw).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(mb|mien bac|bac|bao bac)\b/.test(t)) return 'MB';
    if (/\b(mn|mien nam|nam)\b/.test(t)) return 'MN';
    if (/\b(mt|mien trung|trung)\b/.test(t)) return 'MT';
    return fallback || 'MT';
}

// Từ điển con giáp / chẵn lẻ (giữ nguyên nếu bạn đã có)
const ALL_DICT = {
    ...(typeof PAIR_SETS_NORM !== 'undefined' ? PAIR_SETS_NORM : {}),
    ...(typeof ZODIAC_MAP !== 'undefined' ? ZODIAC_MAP : {})
};
const DICT_KEYS = Object.keys(ALL_DICT);
const DICT_REGEX = DICT_KEYS.length > 0
    ? new RegExp('\\b(' + DICT_KEYS.join('|') + ')\\b', 'gi')
    : null;

function parseSmartLottoText(rawText, region) {
    const results = [];
    if (!rawText) return results;

    // typeRe: thêm dac biet / dacbiet / xiuchu / dauduoi / baolo…
    const typeRe = /\b(bao\s*bac|bao\s*lo|baolo|blo|bl|lo|da|dx|dvong|davong|lienhoan|dv|cheo|xien|xuyen|xc|xiuchu|dac\s*biet|dacbiet|dac\s*bit|db|de|debiet|dc|dd|daucuoi|dauduoi|c2|c3|g8g7g6g5g4|g7g6g5g4|g3g2g1db|g7g6|g6g5|g5g4|g3g2|g2g1|g1db|g6g4g3|g6g4|g4g3|g6g3|g4lo5|g4lo7|g6lo1|10lo|10c|5c|4c|3c|2c|3d|8d|10d|12d|13d|g[1-8]|dau|duoi)\b/gi;

    const moneyRe = /(?:[=:]|\bx\s*)(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)(?=\s|$|[.+])|\b(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m))\b|\b(\d+(?:[.,/]\d+)?)(?=\s*(?:[.+]|$))/gi;

    const add = (nums, amount, type, note = '', linkId = '', tierOnly = '') => {
        if (!amount || !nums.length) return;
        if (type === 'dv') {
            const uniqueNums = [...new Set(nums)];
            if (uniqueNums.length < 3) return;
            const pairs = uniqueNums.flatMap((first, index) =>
                uniqueNums.slice(index + 1).map(second => [first, second])
            );
            pairs.forEach(pair => {
                const item = createItem(pair.join('-'), amount, region, type, note);
                item.linkId = linkId;
                item.pairNums = pair;
                results.push(item);
            });
            return;
        }
        if (['da', 'dx', 'cheo', 'xien'].includes(type)) {
            const uniqueNums = [...new Set(nums)];
            if (uniqueNums.length < 2) return;
            // "Chéo/Xiên" đúng nghĩa phải từ 3 số trở lên — gõ "chéo"/"xiên"
            // nhưng chỉ đưa đúng 2 số thì thực chất là "Đá Thẳng" (tiền tính
            // giống hệt nhau nên không lệch, chỉ đổi lại đúng TÊN loại).
            const isCheoKeyword = ['dx', 'cheo', 'xien'].includes(type);
            const betTypeKey = (isCheoKeyword && uniqueNums.length >= 3) ? 'dx' : 'da';
            const group = betTypeKey === 'da' ? uniqueNums.slice(0, 2) : uniqueNums;
            const item = createItem(group.join('-'), amount, region, betTypeKey, note, '', tierOnly);
            item.linkId = linkId;
            item.pairNums = group;
            results.push(item);
            return;
        }
        nums.forEach(num => {
            const item = createItem(num, amount, region, type, note, '', tierOnly);
            item.linkId = linkId;
            results.push(item);
        });
    };

    const parseNumberList = value => (String(value || '').match(/\d{2,3}/g) || []);

    /** Chuẩn hóa từ khóa dài → mã ngắn TRƯỚC khi match type */
    const normalizeTypePhrases = (line) => {
        return String(line)
            .replace(/\bdac\s*biet\b/gi, 'db')
            .replace(/\bdac\s*bit\b/gi, 'db')
            .replace(/\bdebiet\b/gi, 'db')
            .replace(/\bdacbiet\b/gi, 'db')
            .replace(/\bxiuchu\b/gi, 'xc')
            .replace(/\bdaucuoi\b/gi, 'dd')
            .replace(/\bdauduoi\b/gi, 'dd')
            .replace(/\bbaolo\b/gi, 'bl')
            .replace(/\bbao\s*lo\b/gi, 'bl')
            .replace(/\blienhoan\b/gi, 'dv')
            .replace(/\bdavong\b/gi, 'dv')
            .replace(/\bdvong\b/gi, 'dv');
    };

    const addGroupedClauses = (line, lineIndex) => {
        let handled = false;
        let clauseIndex = 0;

        // lo/bl + db/de/dac biet (đã normalize nên chỉ cần db|de)
        const loDbRe = /(?:^|\s)([\d]{2,3}(?:[\s,.+\-]+\d{2,3})*)\s*(?:lo|blo|bl)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)\s*\+\s*(?:db|de)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)/gi;
        let match;
        while ((match = loDbRe.exec(line)) !== null) {
            const numbers = parseNumberList(match[1]);
            if (!numbers.length) continue;
            const groupId = `quick-${lineIndex}-${clauseIndex++}`;
            const lotType = numbers.every(number => number.length === 3) ? '3c' : '2c';
            add(numbers, parseAmount(match[2]), lotType, 'LO', `${groupId}-lo`);
            add(numbers, parseAmount(match[3]), 'db', 'DB', `${groupId}-db`);
            handled = true;
        }

        // Số + db/de (sau normalize: "39 db 300k")
        const dbRe = /(?:^|\s)([\d]{2,3}(?:[\s,.+\-]+\d{2,3})*)\s*(?:db|de)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)/gi;
        while ((match = dbRe.exec(line)) !== null) {
            const numbers = parseNumberList(match[1]);
            if (!numbers.length) continue;
            const groupId = `quick-${lineIndex}-${clauseIndex++}`;
            add(numbers, parseAmount(match[2]), 'db', 'DB', `${groupId}-db`);
            handled = true;
        }
        return handled;
    };

    String(rawText).replace(/\r/g, '').split(/[\n;]+/).forEach((raw, lineIndex) => {
        let line = raw.toLowerCase().replace(/^\[.*?\]\s*\w+:\s*/i, ' ').trim();
        if (!line) return;

        // Bỏ dấu + đ→d
        line = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        // Chuẩn hóa cụm từ loại cược dài → mã ngắn (quan trọng!)
        line = normalizeTypePhrases(line);
        line = line.replace(/d\s*b\b/gi, 'db');
        line = line.replace(/\b(db|de|lo|blo|bl)\s*(?=\d)/gi, '$1 ');

        if (addGroupedClauses(line, lineIndex)) return;

        const compactGroupedItems = parseCompactGroupedBetLine(line, region);
        if (compactGroupedItems) {
            results.push(...compactGroupedItems);
            return;
        }
        const dottedItems = parseDottedBetLine(line, region);
        if (dottedItems) {
            results.push(...dottedItems);
            return;
        }

        line = line.replace(/(\d{2,4})(da|cheo|xien|xuyen)(\d{2,4})/gi, '$1 $2 $3')
            .replace(/(\d{2,4})(db|de)(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, '$1 $2 $3')
            .replace(/g(?!6g3\b)([1-8])g([1-8])/gi, 'g$1 g$2');

        const ranges = /\b(\d{1,3})\s*(?:den|toi|\.\.|…)\s*(\d{1,3})\b/gi;
        line = line.replace(ranges, (full, from, to, offset, whole) => {
            const start = Number(from), end = Number(to);
            const tail = whole.slice(offset + full.length, offset + full.length + 35);
            const money = tail.match(/(?:[=:]|\bx\s*)\s*(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)|\b(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m))\b/i);
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            const kind = tail.match(/\b(c2|c3|g8g7g6g5g4|g7g6g5g4|g3g2g1db|g7g6|g6g5|g5g4|g3g2|g2g1|g1db|g6g4g3|g6g4|g4g3|g6g3|g[1-8]lo\d+|g[1-8]|db|de|dc|dd|10lo|10c|5c|4c|3c|2c|3d|8d|10d|12d|13d)\b/i);
            if (amount > 0 && end >= start && end - start <= 99) {
                const width = Math.max(2, from.length, to.length);
                add(
                    Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(width, '0')),
                    amount,
                    mapBetType(kind?.[1] || 'bl'),
                    'RANGE'
                );
            }
            return ' ';
        });

        const hits = [...line.matchAll(typeRe)];
        if (!hits.length) {
            const money = [...line.matchAll(moneyRe)].pop();
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            const nums = extractNums(line);
            if (amount > 0 && nums.length) {
                nums.forEach(num => {
                    const digits = num.length;
                    add([num], amount, digits >= 4 ? '4c' : (digits === 3 ? '3c' : 'bl'), 'AUTO');
                });
            }
            return;
        }

        const orderedGroups = [];
        let previousNumbers = [];
        let pendingPatternTypes = [];
        let pendingTierRestrict = [];
        for (let index = 0; index < hits.length; index++) {
            const hit = hits[index];
            const nextIndex = index + 1 < hits.length ? hits[index + 1].index : line.length;
            const beforeStart = index ? hits[index - 1].index + hits[index - 1][0].length : 0;
            const before = line.slice(beforeStart, hit.index);
            const after = line.slice(hit.index + hit[0].length, nextIndex);
            const type = mapBetType(hit[0]);

            // "Gnhat"/"g1"/"g4lo6"/"Db" đứng TRƠ TRỌI (không kèm số cược riêng
            // trước/sau, không kèm tiền riêng) rồi theo sau là 1 loại "cả cụm"
            // → hiểu là GIỚI HẠN cụm đó chỉ so với đúng (các) giải này, gộp
            // OR — khớp 1 TRONG SỐ đó là đủ (VD "Gnhat. Le le x 50k" → chỉ
            // tính trúng khi Giải Nhất về đúng số; "Db+G7. Chan chan x 35k" →
            // trúng khi ĐB HOẶC G7 về đúng số — không tính bao lô như mặc
            // định). Riêng "Db" phải kèm điều kiện KHÔNG có tiền riêng, vì
            // "Đb. 2k" vẫn là cú pháp CŨ (dùng lại số trước đó, có tiền ngay
            // sau) — không được đụng vào, giữ nguyên như trước giờ.
            const isTierWord = /^g[1-8]$/.test(type) || /^g[1-8]lo\d+$/.test(type) || type === 'db';
            if (isTierWord) {
                const hasOwnNumber = extractNums(after.split(/[=:]/)[0]).length > 0 || extractNums(before).length > 0;
                // Đảo ngược thứ tự cũng phải hiểu được (VD "Heo Db 50k"/"Heo
                // G6 G7 30k" — con giáp/cả cụm gõ TRƯỚC, giải/tier gõ SAU):
                // nếu đang có sẵn 1 (hay nhiều) loại "cả cụm" còn TREO CHỜ
                // tiền (pendingPatternTypes chưa rỗng) thì giải/tier này vẫn
                // thuộc về ĐÚNG cụm đó, kể cả khi có tiền ngay sau nó — lúc
                // này rõ ràng không phải câu "Đb. 2k" kiểu cũ (1 dòng Đặc
                // Biệt độc lập, dùng lại số của mệnh đề trước) nữa.
                const continuesPendingPattern = !hasOwnNumber && pendingPatternTypes.length > 0;
                if (continuesPendingPattern) {
                    pendingTierRestrict.push(type);
                    const tierMoneyMatches = [...after.matchAll(moneyRe)];
                    const tierMoney = tierMoneyMatches.find(m => m[1] || m[2]) || tierMoneyMatches.at(-1);
                    const tierAmount = parseAmount(tierMoney?.[1] || tierMoney?.[2] || tierMoney?.[3]);
                    if (tierAmount > 0) {
                        const lastPatternType = pendingPatternTypes[pendingPatternTypes.length - 1];
                        pendingPatternTypes.forEach(t => {
                            orderedGroups.push({ type: t, numbers: [...PATTERN_TYPE_NUMS[t]], amount: tierAmount, tierOnly: [...pendingTierRestrict] });
                        });
                        previousNumbers = [...PATTERN_TYPE_NUMS[lastPatternType]];
                        pendingPatternTypes = [];
                        pendingTierRestrict = [];
                    }
                    continue;
                }

                // Thứ tự thuận (giải/tier gõ TRƯỚC con giáp) — giữ nguyên như
                // trước giờ, không đổi gì ở nhánh này.
                const isBareDb = type === 'db' && ![...after.matchAll(moneyRe)].length;
                // Chỉ nuốt làm "giới hạn giải" khi PHÍA SAU thực sự có 1 loại
                // "cả cụm" (chan_chan/le_le/giap...) đang chờ — nếu không, đây
                // chỉ là 1 mệnh đề BÌNH THƯỜNG muốn dùng lại số của mệnh đề
                // trước (VD "459 bl 10n, giải7 20n" — "giải7" không giới hạn
                // cụm nào cả). Thiếu bước nhìn trước này thì mệnh đề đó bị
                // nuốt mất trắng, không rơi xuống được cơ chế dùng-lại-số.
                let followsPatternType = false;
                if (!hasOwnNumber) {
                    for (let peek = index + 1; peek < hits.length; peek++) {
                        const peekType = mapBetType(hits[peek][0]);
                        if (PATTERN_TYPE_NUMS[peekType]) { followsPatternType = true; break; }
                        // Đá/Chéo/Xiên/Vòng cũng nhận giới hạn giải được (VD
                        // "G4. 12 chéo 34 chéo 56 x10k" → chỉ dò riêng Giải
                        // 4) — khác PATTERN_TYPE_NUMS ở chỗ đá không có dàn
                        // số cố định (số thật lấy ngay trong câu), nên chỉ
                        // cần biết ĐÂY LÀ đá là đủ để nhìn trước; phần gắn
                        // tierOnly thật sự xử lý riêng lúc tạo dòng bên dưới.
                        if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(peekType)) { followsPatternType = true; break; }
                        const peekIsBareTier = /^g[1-8]$/.test(peekType) || /^g[1-8]lo\d+$/.test(peekType) || peekType === 'db';
                        if (!peekIsBareTier) break;
                    }
                }
                if (!hasOwnNumber && (isBareDb || type !== 'db') && followsPatternType) {
                    pendingTierRestrict.push(type);
                    continue;
                }

                // Đá/Chéo/Xiên/Vòng: số của ĐÁ thường nằm NGAY GIỮA tier-word
                // và từ khóa đá (VD "G4. 12 34 56 chéo x10k") — khác hẳn con
                // giáp/chẵn lẻ (không có số riêng), nên KHÔNG dùng chung điều
                // kiện !hasOwnNumber ở trên (numbers ở giữa khiến hasOwnNumber
                // luôn = true). Chỉ cần chắc chắn CHƯA có tiền nào chen giữa —
                // có tiền rồi nghĩa là tier-word đã là 1 dòng cược ĐỘC LẬP
                // xong xuôi, không liên quan gì tới đá đứng sau nó nữa.
                // Chỉ coi là "có tiền riêng" khi thấy tiền RÕ RÀNG (có đơn vị
                // k/n/tr/m/ng, hoặc có tiền tố =/:/x) — dùng moneyRe đầy đủ ở
                // đây sẽ dính nhầm chính SỐ CUỐI của đá (VD "56" trong "G4.
                // 12 34 56 chéo x10k") vì moneyRe có nhánh coi 1 số trơ trọi
                // đứng cuối là tiền thiếu chữ "k" — không đúng ý ở đây.
                const hasExplicitOwnAmount = /(?:[=:]|\bx\s*)\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\b|\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)\b/i.test(after);
                if (!hasExplicitOwnAmount && index + 1 < hits.length) {
                    const nextType = mapBetType(hits[index + 1][0]);
                    if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(nextType)) {
                        pendingTierRestrict.push(type);
                        continue;
                    }
                }
            }

            // Chẵn/Lẻ theo cặp + 12 Con Giáp: dàn số CỐ ĐỊNH có sẵn, không cần
            // gõ tay số nào — chỉ cần tìm đúng số TIỀN đứng sau tên loại. Nhiều
            // loại "cả cụm" đứng liền nhau (VD "le le, le chan x 50k") dùng
            // CHUNG tiền của cụm cuối cùng — mỗi loại vẫn nhân đủ 50k riêng.
            if (PATTERN_TYPE_NUMS[type]) {
                const patternMoneyMatches = [...after.matchAll(moneyRe)];
                const patternMoney = patternMoneyMatches.find(m => m[1] || m[2]) || patternMoneyMatches.at(-1);
                const patternAmount = parseAmount(patternMoney?.[1] || patternMoney?.[2] || patternMoney?.[3]);
                pendingPatternTypes.push(type);
                if (patternAmount > 0) {
                    pendingPatternTypes.forEach(t => {
                        orderedGroups.push({ type: t, numbers: [...PATTERN_TYPE_NUMS[t]], amount: patternAmount, tierOnly: [...pendingTierRestrict] });
                    });
                    previousNumbers = [...PATTERN_TYPE_NUMS[type]];
                    pendingPatternTypes = [];
                    pendingTierRestrict = [];
                }
                continue;
            } else if (pendingPatternTypes.length) {
                // Loại "cả cụm" đứng trước chưa tìm được tiền riêng, nhưng gặp
                // ngay 1 loại KHÁC (không phải cả cụm) — không cùng cụm tiền
                // nữa, bỏ để tránh gán nhầm tiền của clause khác vào.
                pendingPatternTypes = [];
                pendingTierRestrict = [];
            }

            const afterNumbers = extractNums(after.split(/[=:]/)[0]);

            const lastMoneyInBefore = [...before.matchAll(/(?:[=:]\s*)?\d+(?:[.,/]\d+)?(?:k|n|tr|m|ng)\b/gi)].pop();
            const beforeFresh = lastMoneyInBefore
                ? before.slice(lastMoneyInBefore.index + lastMoneyInBefore[0].length)
                : before;
            const beforeNumbers = extractNums(beforeFresh);
            const explicitAmounts = [...after.matchAll(/\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)\b/gi)];
            const isPairType = ['da', 'dx', 'dv', 'cheo', 'xien'].includes(type);

            if (afterNumbers.length && explicitAmounts.length) {
                let clauseStart = 0;
                explicitAmounts.forEach((amountMatch, amtIdx) => {
                    const clauseNumberText = after.slice(clauseStart, amountMatch.index);
                    let clauseNumbers = extractNums(clauseNumberText);
                    if (isPairType && amtIdx === 0 && beforeNumbers.length) {
                        clauseNumbers = [...beforeNumbers, ...clauseNumbers];
                    }
                    const amount = parseAmount(amountMatch[0]);
                    // "=" (hoặc ":") ngay trước số tiền này → TỔNG CUỐI CÙNG, không
                    // phải giá mỗi lô (xem giải thích ở nhánh "else" phía dưới).
                    const isTotalAmount = /[=:]\s*$/.test(clauseNumberText);
                    if (clauseNumbers.length && amount > 0) {
                        // Đá/Chéo/Xiên/Vòng có sẵn giới hạn giải treo từ mệnh
                        // đề trước (VD "G4. 12 chéo 34 chéo 56 x10k") → gắn
                        // luôn vào dòng này, chỉ dò đúng giải đó thay vì bao
                        // lô mặc định. Dùng xong xóa ngay, không để dính sang
                        // mệnh đề khác không liên quan.
                        const pairTierOnly = (isPairType && pendingTierRestrict.length) ? [...pendingTierRestrict] : undefined;
                        orderedGroups.push({ type, numbers: [...new Set(clauseNumbers)], amount, isTotalAmount, ...(pairTierOnly ? { tierOnly: pairTierOnly } : {}) });
                        previousNumbers = [...new Set(clauseNumbers)];
                        if (pairTierOnly) pendingTierRestrict = [];
                    }
                    clauseStart = amountMatch.index + amountMatch[0].length;
                });
            } else {
                // Mở rộng thêm "g1".."g8" và "g_lo_" (VD "giải7"/"g4lo6") vào
                // danh sách được DÙNG LẠI SỐ CŨ khi đứng 1 mình không kèm số
                // riêng — trước đây chỉ 4c/5c/10c/db được vậy, nên 1 dòng kiểu
                // "459 bl 10n, giải7 20n, đb 100n" bị RỚT hẳn mệnh đề "giải7"
                // (không có cơ chế nào cho nó mượn lại số 459 ở trên).
                const reusableType = /^(4c|5c|10c|db|g[1-8]|g[1-8]lo\d+)$/.test(type) || isPairType;
                const singleBareTrailing = afterNumbers.length === 1 && !beforeNumbers.length;
                let numbers;
                if (reusableType && previousNumbers.length && singleBareTrailing) {
                    numbers = previousNumbers;
                } else if (afterNumbers.length) {
                    numbers = (isPairType && beforeNumbers.length)
                        ? [...beforeNumbers, ...afterNumbers]
                        : afterNumbers;
                } else if (beforeNumbers.length) {
                    numbers = beforeNumbers;
                } else if (reusableType) {
                    numbers = previousNumbers;
                } else {
                    numbers = [];
                }
                const moneyMatches = [...after.matchAll(moneyRe)];
                const money = moneyMatches.find(m => m[1] || m[2]) || moneyMatches.at(-1);
                const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
                if (numbers.length && amount > 0) {
                    orderedGroups.push({ type, numbers: [...new Set(numbers)], amount });
                    previousNumbers = [...new Set(numbers)];
                }
            }
        }

        if (orderedGroups.length) {
            orderedGroups.forEach((group, groupIndex) => {
                if (group.isTotalAmount) {
                    // Có "=" → group.amount là TỔNG CUỐI CÙNG, không phải giá mỗi
                    // lô. Tạo tạm với giá 1k/số để ĐO đúng số lô/số dòng thật của
                    // loại cược này (qua calculateItemFinancials — không tự tính
                    // lại luật lô ở đây, tránh lệch với công thức tính tiền chính),
                    // rồi suy ngược ra giá mỗi số sao cho tổng khớp đúng ý người gõ.
                    // Ghi chú hiển thị tên đọc được (VD "Tỵ (Rắn)") thay vì mã
                    // thô (VD "RAN") — nhìn vào bảng chi tiết biết ngay đây là
                    // cược con giáp/chẵn lẻ nào, khỏi phải đoán qua mã viết tắt.
                    const noteText = getRegionAwareTypeName(group.type, region);
                    const created = add(group.numbers, 1, group.type, noteText, `group-${groupIndex}`, group.tierOnly || '');
                    if (created.length && typeof calculateItemFinancials === 'function') {
                        const costFor1k = created.reduce((sum, it) => sum + calculateItemFinancials(it, region).totalItemCost, 0);
                        if (costFor1k > 0) {
                            const scale = (group.amount * 1000) / costFor1k;
                            created.forEach(it => {
                                it.originalAmount = Math.round(it.originalAmount * scale * 100) / 100;
                                it.amount = it.originalAmount * 1000;
                            });
                        }
                    }
                } else {
                    const noteText2 = getRegionAwareTypeName(group.type, region);
                    add(group.numbers, group.amount, group.type, noteText2, `group-${groupIndex}`, group.tierOnly || '');
                }
            });
            return;
        }

        let previousNums = [];
        hits.forEach((match, index) => {
            const previousEnd = index ? hits[index - 1].index + hits[index - 1][0].length : 0;
            const before = line.slice(previousEnd, match.index);
            const after = line.slice(
                match.index + match[0].length,
                index + 1 < hits.length ? hits[index + 1].index : line.length
            );
            const type = mapBetType(match[0]);
            const moneyMatches = [...after.matchAll(moneyRe)];
            const money = moneyMatches.find(m => m[1] || m[2]) || moneyMatches.at(-1);
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            const numberSource = index && /\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\s*[.+]?\s*$/i.test(before)
                ? ''
                : before;
            let nums = extractNums(numberSource);
            const numsAfterType = extractNums(
                after.split(/[=:]|\bx\s*/i)[0].replace(/\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\s*[.+]?\s*$/i, '')
            );
            if (!nums.length && numsAfterType.length) nums = numsAfterType;
            if (!nums.length) nums = [...previousNums];
            else previousNums = [...nums];
            if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(type)) {
                nums = [...nums, ...extractNums(after.split(/[=:]|\bx\s*/i)[0])];
                previousNums = [...nums];
            }
            const isSharedAmount = /[=:]/.test(after);
            add(
                nums,
                isSharedAmount ? amount / Math.max(nums.length, 1) : amount,
                type,
                match[0].toUpperCase()
            );
        });
    });

    return results.filter(item => Number(item.originalAmount) > 0);
}

function parseSmartLottoText(rawText, region) {
    const results = [];
    if (!rawText) return results;
    // Số của cụm cược NGAY TRƯỚC — dùng khi 1 dòng bị tách thành nhiều dòng
    // "ảo" (xem normalizedForSplit bên dưới) NHƯNG cụm sau vẫn muốn DÙNG LẠI
    // số của cụm trước (VD "272 4 chốt 100k. đb 300k" — "đb 300k" không có
    // số riêng, ý là 272). Xoá về [] mỗi khi gặp dòng THẬT (xuống dòng/";"
    // người dùng gõ) để không dính số giữa 2 tin/2 khách khác nhau.
    let carryNumbers = [];
    const typeRe = /\b(bao\s*bac|bao\s*lo|blo|bl|lo|da|dx|dvong|davong|lienhoan|dv|cheo|xien|xuyen|xc|dac\s*biet|dacbiet|dac\s*bit|db|de|dc|dau\s*chot|dd|c2|c3|g8g7g6g5g4|g7g6g5g4|g3g2g1db|g4g3g2g1db|g8g7g6g5|g7g6g5|g7g6|g6g5|g5g4|g3g2|g2g1|g1db|g6g4g3|g6g4|g4g3|g6g3|g[1-8]lo\d+|10lo|10c|14\s*cuoi|14c|12\s*cuoi|5\s*cuoi|4\s*cuoi|4\s*chot|5\s*dau|6\s*dau|5c|4c|3c|2c|3d|5d|6d|8d|10d|12d|13d|12\s*con\s*giap|con\s*giap|giap|chan\s*chan|le\s*le|chan\s*le|le\s*chan|g\s*nhat|g\s*nhi|g\s*ba|g\s*tu|g\s*nam|g\s*sau|g\s*bay|g\s*tam|giai\s*[1-8]|chuot|trau|cop|meo|rong|ran|ngua|mui|khi|tuat|cho|hoi|heo|lon|ty|suu|dan|ho|mao|thin|ngo|than|ga|g[1-8]|dau|duoi|chot)\b/gi;
    const moneyRe = /(?:[=:]|\bx\s*)(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)(?=\s|$|[.+])|\b(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m))\b|\b(\d+(?:[.,/]\d+)?)(?=\s*(?:[.+]|$))/gi;
    // Trả về mảng dòng cược vừa tạo (ngoài việc đẩy vào `results` như cũ) để
    // chỗ gọi có thể ĐO lại chi phí thật (đo qua calculateItemFinancials) khi
    // cần chia lại tiền cho đúng kiểu "=" (tổng cuối cùng cố định).
    const add = (nums, amount, type, note = '', linkId = '', tierOnly = '') => {
        if (!amount || !nums.length) return [];
        if (type === 'dv') {
            // Đá Vòng/Liên Hoàn/CHÉO (xác nhận Cocomi: "chéo" là 1 mã với
            // "vòng"/"liên hoàn" — tách nhóm số thành TỪNG CẶP đôi độc lập
            // (C(n,2) cặp), mỗi cặp tự ăn/thua riêng — trúng 1 phần vẫn có
            // tiền, khác hẳn Đá Xiên (cả nhóm phải về đủ mới ăn).
            const uniqueNums = [...new Set(nums)];
            if (uniqueNums.length < 2) return [];
            // Chỉ đúng 2 số thì "chéo/vòng" cũng chỉ ra được 1 cặp duy nhất —
            // thực chất là "Đá Thẳng" (tiền tính giống hệt, chỉ đổi lại TÊN).
            if (uniqueNums.length < 3) {
                const group = uniqueNums.slice(0, 2);
                const item = createItem(group.join('-'), amount, region, 'da', note, '', tierOnly);
                item.linkId = linkId;
                item.pairNums = group;
                results.push(item);
                return [item];
            }
            const pairs = uniqueNums.flatMap((first, index) => uniqueNums.slice(index + 1).map(second => [first, second]));
            return pairs.map(pair => {
                const item = createItem(pair.join('-'), amount, region, type, note, '', tierOnly);
                item.linkId = linkId;
                item.pairNums = pair;
                results.push(item);
                return item;
            });
        }
        if (['da', 'dx'].includes(type)) {
            // 2 số = đá thẳng (1 cặp duy nhất). 3+ số = đá XIÊN — CẢ NHÓM là
            // MỘT cược duy nhất (trúng khi TẤT CẢ số trong nhóm đều về,
            // thiếu 1 số là thua cả cụm) — KHÔNG tách thành nhiều cặp độc
            // lập (đó là "Đá Chéo"/dv, xử lý ở nhánh trên, khác cơ chế).
            const uniqueNums = [...new Set(nums)];
            if (uniqueNums.length < 2) return [];
            // "Xiên" đúng nghĩa phải từ 3 số trở lên — gõ "xiên" nhưng chỉ
            // đưa đúng 2 số thì thực chất là "Đá Thẳng" (tiền tính giống hệt
            // nhau nên không lệch, chỉ đổi lại đúng TÊN loại).
            const betTypeKey = (type === 'dx' && uniqueNums.length >= 3) ? 'dx' : 'da';
            const group = betTypeKey === 'da' ? uniqueNums.slice(0, 2) : uniqueNums;
            const item = createItem(group.join('-'), amount, region, betTypeKey, note, '', tierOnly);
            item.linkId = linkId;
            item.pairNums = group;
            results.push(item);
            return [item];
        }
        return nums.map(num => {
            const item = createItem(num, amount, region, type, note, '', tierOnly);
            item.linkId = linkId;
            results.push(item);
            return item;
        });
    };

    const parseNumberList = value => (String(value || '').match(/\d{2,3}/g) || []);
    const addGroupedClauses = (line, lineIndex) => {
        // "đảo" ở đâu đó trên dòng (kể cả TRƠ TRỌI, dùng lại dàn số của cụm
        // trước — VD "986, 382 đb 50k, đảo đb 5k") thì KHÔNG được nhận dòng
        // này — hàm này chỉ hiểu ĐÚNG 1 cụm "số...db...tiền" đầu tiên rồi
        // báo "đã xử lý xong" (return true) khiến cả dòng bị bỏ qua luôn ở
        // trên, mất sạch cụm "đảo" phía sau dù chưa hề đụng tới. Nhường lại
        // cho vòng lặp chung bên dưới — nơi ĐÃ xử lý đúng cả 2 việc (danh
        // sách số + đảo) trong cùng 1 dòng.
        if (/\bdao\b/i.test(line)) return false;
        // "[,.+\-]+\d" (không cho khoảng trắng sau dấu phẩy) làm rớt hết số
        // phía trước khi người dùng gõ "986, 382" (có dấu cách sau phẩy —
        // cách gõ rất phổ biến trong tin nhắn thật) — chỉ đổi thành
        // "[,.+\-]\s*\d" để cho phép khoảng trắng đó, không đổi gì khác.
        const loDbRe = /(?:^|\s)([\d]{2,3}(?:[\s,.+\-]+\d{2,3})*)\s*(?:lo|blo|bl)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)\s*\+\s*(?:db|de)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)/gi;
        const dbRe = /(?:^|\s)([\d]{2,3}(?:[\s,.+\-]+\d{2,3})*)\s*(?:db|de)\s*(\d+(?:[.,]\d+)?(?:k|n|m)?)/gi;
        const loDbMatches = [...line.matchAll(loDbRe)];
        const dbMatches = [...line.matchAll(dbRe)];
        if (!loDbMatches.length && !dbMatches.length) return false;

        // Dòng thật hay chứa NHIỀU cụm cược KHÁC LOẠI đứng trước/sau cụm db
        // này (VD "Đá 02.80x5k .Bao lô.02.80x5k ... 98.698.54.354 đb 15k..
        // 88.g7 x70k ..."). Hàm này chỉ hiểu đúng (các) cụm "số...db...tiền"
        // — nếu add() xong rồi báo "đã xử lý xong" (return true) như trước
        // đây, TOÀN BỘ cụm khác (Đá/Bao lô/G7/Giải...) trong CÙNG dòng bị bỏ
        // qua ở trên, mất trắng dù chưa hề đụng tới. Xóa các đoạn đã khớp
        // rồi rà lại phần CÒN LẠI: còn từ khóa thể loại nào khác ngoài chính
        // "db"/"de" thì nhường lại CẢ DÒNG cho vòng lặp chung bên dưới (nơi
        // đã hiểu đủ mọi loại cược trộn lẫn trong 1 dòng).
        let leftover = line;
        [...loDbMatches, ...dbMatches]
            .sort((a, b) => b.index - a.index)
            .forEach(m => {
                leftover = leftover.slice(0, m.index) + ' ' + leftover.slice(m.index + m[0].length);
            });
        const leftoverHasOtherType = [...leftover.matchAll(typeRe)].some(m => mapBetType(m[0]) !== 'db');
        if (leftoverHasOtherType) return false;

        let handled = false;
        let clauseIndex = 0;
        loDbMatches.forEach(match => {
            const numbers = parseNumberList(match[1]);
            if (!numbers.length) return;
            const groupId = `quick-${lineIndex}-${clauseIndex++}`;
            const lotType = numbers.every(number => number.length === 3) ? '3c' : '2c';
            add(numbers, parseAmount(match[2]), lotType, 'LO', `${groupId}-lo`);
            add(numbers, parseAmount(match[3]), 'db', 'DB', `${groupId}-db`);
            handled = true;
        });
        dbMatches.forEach(match => {
            const numbers = parseNumberList(match[1]);
            if (!numbers.length) return;
            const groupId = `quick-${lineIndex}-${clauseIndex++}`;
            add(numbers, parseAmount(match[2]), 'db', 'DB', `${groupId}-db`);
            handled = true;
        });
        return handled;
    };

    // Khách hay gõ NHIỀU cụm cược liền nhau trên CÙNG 1 dòng, ngăn cách bằng
    // 1 chuỗi CHẤM LẶP LẠI (VD "...", "....." — 3 chấm trở lên) như dấu
    // xuống dòng tạm — VD "03.30 g3.3k.....03.30.10 đá chéo 0,5...05.15.35
    // g1 10k". Trước đây cả dòng bị gộp chung 1 lượt xử lý, khiến số/loại
    // của các cụm sau bị LẪN VÀO cụm trước (dùng lại nhầm số/loại cũ) — dù
    // TỪNG CỤM tách riêng vẫn parse đúng 100%. Tách CHỦ ĐỘNG tại đây thành
    // nhiều dòng riêng (y hệt xuống dòng thật) TRƯỚC khi xử lý, để mỗi cụm
    // được xử lý ĐỘC LẬP như khi test riêng — chỉ tách từ 3 CHẤM LIỀN NHAU
    // trở lên (CHỪA đúng 2 chấm ".." vì đó là cú pháp "kéo dãy số", VD
    // "05..95 g1 5k", không được đụng vào).
    //
    // Tin thật còn hay dùng ĐÚNG 1 (hoặc 2) CHẤM để ngăn cụm cược này với
    // cụm KẾ TIẾP, ngay khi cụm trước vừa xong TIỀN (VD "Đá 02.80.x5k .Bao
    // lô.02.80x5k .Bao lô 380.x2k . 98.698.54.354 đb 15k.. 88.g7 x70k").
    // Không thể tách MỌI dấu chấm (chấm còn dùng để nối danh sách số như
    // "02.80"/"98.698.54.354", và nối loại+tiền như "g7.5k") — nhưng dấu
    // chấm đứng NGAY SAU 1 khoản TIỀN đã hoàn chỉnh (có đơn vị k/n/tr/m/ng,
    // hoặc có tiền tố "x") thì chắc chắn không phải để nối số nữa (số trong
    // danh sách không bao giờ có đơn vị tiền) — an toàn để hiểu là hết cụm
    // này. Dùng "" (khác "\n" thật) để CÒN PHÂN BIỆT được đây là ranh
    // giới "ảo" (cùng 1 dòng gốc, được PHÉP dùng lại số của cụm liền trước
    // qua carryNumbers) hay ranh giới THẬT (xuống dòng/";" người dùng gõ,
    // PHẢI xoá carryNumbers — 2 dòng thật là 2 cược độc lập, không liên quan).
    const normalizedForSplit = String(rawText)
        .replace(/\.{3,}/g, '')
        .replace(/((?:x\s*\d+(?:[.,\/]\d+)?(?:ng|tr|k|n|m)?|\d+(?:[.,\/]\d+)?(?:ng|tr|k|n|m)))\s*\.{1,2}(?!\.)/gi, '$1');
    const splitParts = normalizedForSplit.replace(/\r/g, '').split(/([\n;]+)/);
    splitParts.forEach((raw, partIndex) => {
        if (partIndex % 2 === 1) {
            if (/[\n;]/.test(raw)) carryNumbers = [];
            return;
        }
        const lineIndex = partIndex / 2;
        let line = raw.toLowerCase().replace(/^\[.*?\]\s*\w+:\s*/i, ' ').trim();
        if (!line) return;
        line = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        line = line.replace(/d\s*b\b/gi, 'db');
        line = line.replace(/\b(db|de|lo|blo|bl)\s*(?=\d)/gi, '$1 ');
        // "Tc"/"tổng cộng" + số ở CUỐI dòng chỉ là khách GHI LẠI tổng tiền để
        // đối chiếu (giống "=460"/"ok=460"), không phải thêm 1 cược mới. Nếu
        // không loại bỏ, số tiền này bị hiểu nhầm thành 1 khoản TIỀN MỚI, tự
        // động dùng lại dàn số của cụm ngay trước đó — tạo thêm 1 dòng cược
        // ẢO không hề có trong ý khách (VD "...375 g1.5k TC 80k" bị hiểu
        // thành CƯỢC THÊM g1 80k cho đúng dàn số vừa liệt kê).
        line = line.replace(/\b(?:tc|tong\s*cong)\b\s*\.?\s*\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\s*$/i, '').trim();
        if (addGroupedClauses(line, lineIndex)) return;
        const compactGroupedItems = parseCompactGroupedBetLine(line, region);
        if (compactGroupedItems) {
            results.push(...compactGroupedItems);
            return;
        }
        const dottedItems = parseDottedBetLine(line, region);
        if (dottedItems) {
            results.push(...dottedItems);
            return;
        }
        // "đảo" (đã bỏ dấu thành "dao"): hoán vị đủ chữ số của các số ĐỨNG
        // NGAY TRƯỚC nó, áp dụng cho MỌI loại cược kể cả bao lô mặc định/
        // không ghi loại nào. Trước đây "đảo" CHỈ hoạt động qua cú pháp
        // chấm (parseDottedBetLine) và CHỈ khi có kèm 1 từ khóa giải "mạnh"
        // (g1-g8/4c/5c/10c/db...) — nên "68 79 đảo 10k" hay "68 79 đảo bl
        // 10k" (bao lô, loại phổ biến nhất) bị bỏ qua "đảo" hoàn toàn, chỉ
        // tính đúng 2 số gốc. Thay số+"dao" bằng chính TOÀN BỘ hoán vị của
        // chúng (cách nhau dấu cách) để vòng lặp bên dưới xử lý y hệt như
        // gõ tay từng số hoán vị đó.
        line = line.replace(/((?:\d{2,4}[\s,]+)+)dao\b/gi, (full, numsPart) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (!nums.length) return full;
            const expanded = [...new Set(nums.flatMap(n => digitPermutations(n)))];
            return expanded.join(' ') + ' ';
        });
        // "đảo" đứng TRƠ TRỌI (không có số nào ngay trước nó, chỉ có dấu câu/
        // từ khác chen giữa) — VD "986, 382 đb 50k, đảo đb 5k": khách ghi số
        // 1 LẦN cho cụm đầu, rồi muốn ĐẢO LẠI ĐÚNG DÀN SỐ ĐÓ cho cụm giá khác
        // (rất thường gặp — số 1 lần, nhiều cụm giá khác nhau). Regex ở trên
        // CHỈ bắt được khi số đứng NGAY TRƯỚC "đảo" — trường hợp này để sót
        // hoàn toàn (không có số ngay trước, "đảo" bị bỏ qua im lặng, mất
        // luôn cả cụm giá đó). Dùng lại đúng CỤM SỐ GẦN NHẤT xuất hiện trước
        // đó trên dòng (giống cách "4c/5c/g1-g8..." đứng trơ trọi dùng lại số
        // cũ ở chỗ khác trong hàm này).
        if (/\bdao\b/i.test(line)) {
            line = line.replace(/\bdao\b/gi, (full, offset, wholeStr) => {
                // Bỏ hết mảnh số GIỐNG TIỀN (VD "50" trong "50k") trước khi
                // tìm cụm số gần nhất — không thì "đảo" sau 1 cụm tiền dễ bị
                // nhầm đảo NHẦM mảnh số của tiền thay vì đúng dàn số cược.
                const before = wholeStr.slice(0, offset)
                    .replace(/\b\d+(?:[.,/]\d+)?\s*(?:k|n|ng|tr|m)\b/gi, ' ')
                    .replace(/(?:[=:]|\bx\s*)\d+(?:[.,/]\d+)?\b/gi, ' ');
                const groups = before.match(/\d{2,4}(?:[\s,.\-]+\d{2,4})*/g);
                if (!groups || !groups.length) return full;
                const nums = groups[groups.length - 1].match(/\d{2,4}/g) || [];
                if (!nums.length) return full;
                const expanded = [...new Set(nums.flatMap(n => digitPermutations(n)))];
                return expanded.join(' ') + ' ';
            });
        }
        // [GÓI DỮ LIỆU DÙNG CHUNG — dò NHIỀU GIẢI/TIER gộp 1 bộ số + 1 giá]
        // Chỉ liệt kê bí danh THUỘC NHÓM GIẢI/TIER (KHÔNG đụng đá/xiên/chéo/
        // bao lô — nhóm đó có luật tiền riêng khi chỉ 2 số, xử lý ở khối
        // "Xiên+Chéo" phía dưới). Các tổ hợp "cứng" đã xây riêng (g7g6,
        // g6g5, g8g7g6g5g4...) cố tình liệt kê TRƯỚC "g[1-8]" — regex ưu
        // tiên khớp bí danh dài/cụ thể trước, nên "g7g6" tự nuốt gọn thành 1
        // token DUY NHẤT (không tách), trong khi "g3g4" (chưa có bí danh
        // riêng) mới bị bóc thành 2 token "g3"+"g4" — không cần danh sách
        // loại trừ riêng như trước.
        // Khách có thể nối các giải/tier này bằng BẤT KỲ ký tự nào (dính
        // liền "g3g4g5", chấm/phẩy/khoảng trắng/"+"/"&"...) — miễn bí danh
        // đó đã có trong danh sách này (và trong typeRe ở trên) là tự nhận
        // ra, không cần viết thêm regex riêng mỗi khi gặp cách nối MỚI.
        // Thêm giải/tier mới: thêm vào CẢ ĐÂY lẫn typeRe phía trên.
        const TIER_COMBO_ALIASES = 'g8g7g6g5g4|g7g6g5g4|g3g2g1db|g4g3g2g1db|g8g7g6g5|g7g6g5|g7g6|g6g5|g5g4|g3g2|g2g1|g1db|g6g4g3|g6g4|g4g3|g6g3|g[1-8]lo\\d+|10lo|10c|5c|4c|3c|2c|3d|8d|10d|12d|13d|g[1-8]|db|de';
        const tierComboZoneRe = new RegExp(`((?:\\d{2,4}[\\s,.\\-]+)+)((?:(?:${TIER_COMBO_ALIASES})[\\s,.\\-&+]*){2,})((?:x\\s*)?\\d+(?:[.,/]\\d+)?(?:ng|tr|k|n|m)?)`, 'gi');
        line = line.replace(tierComboZoneRe, (full, numsPart, typeZone, amount) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (!nums.length) return full;
            const rawTokens = [...typeZone.matchAll(new RegExp(TIER_COMBO_ALIASES, 'gi'))].map(m => m[0]);
            const canonicalTypes = [...new Set(rawTokens.map(t => mapBetType(t)))];
            if (canonicalTypes.length < 2) return full;
            const numStr = nums.join(' ');
            return canonicalTypes.map(t => `${numStr} ${t} ${amount}`).join(' + ') + ' ';
        });
        // Cùng ý trên nhưng gõ RÕ CHỮ "giải" kèm DANH SÁCH số giải cách nhau
        // bằng chấm/phẩy/khoảng trắng thay vì viết liền "g3g4g5" (VD "02.80
        // giải 3.4.5.x5k" = đánh cả Giải 3, Giải 4, Giải 5 cho 2 số 02, 80,
        // mỗi giải 1 dòng riêng, tách y hệt cơ chế "g3g4g5" bên trên).
        line = line.replace(/((?:\d{2,4}[\s,.\-]+)+)giai\s*\.?\s*((?:[1-8][\s,.\-]*){2,})\.?\s*((?:x\s*)?\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, (full, numsPart, giaiListPart, amount) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (!nums.length) return full;
            const giaiTokens = giaiListPart.match(/[1-8]/g) || [];
            if (giaiTokens.length < 2) return full;
            const numStr = nums.join(' ');
            return giaiTokens.map(d => `${numStr} g${d} ${amount}`).join(' + ') + ' ';
        });
        // Cùng ý trên nhưng gõ tắt "g" + danh sách số giải cách nhau bằng
        // gạch ngang/chấm/phẩy, KHÔNG lặp lại "g" cho từng giải (VD "829-672
        // g4-5 đb 10" = đánh cả Giải 4, Giải 5 VÀ Đặc Biệt cho 2 số 829, 672,
        // cùng chung giá 10 — "đb" phía sau vẫn thuộc chung cụm này). Không
        // đụng "g4lo6" (chữ "lo" chen giữa nên không khớp danh sách chỉ toàn
        // chữ số này).
        // Đã tìm ra & né lỗi CÓ SẴN của cơ chế "+" nối nhiều mệnh đề: mệnh đề
        // có TỪ 2 SỐ TRỞ LÊN đứng trước loại (VD "829 672 g4 ...") CHỈ tính
        // đúng khi tiền có ĐƠN VỊ rõ ràng (VD "10k") — tiền trơ trọi không
        // đơn vị (VD "10") làm số/tiền bị xáo lẫn giữa các mệnh đề (mệnh đề
        // "g3g4g5" trước đây tách đúng vì tiền gốc LUÔN có đơn vị "k"). Chủ
        // động gắn thêm "k" nếu tiền khách gõ trơ trọi — giá trị quy đổi
        // KHÔNG đổi (parseAmount("10") === parseAmount("10k")) nên không ảnh
        // hưởng đúng/sai số tiền, chỉ để tránh đúng lỗi có sẵn đó.
        // Chỉ cho phép dấu ngăn KHÔNG CÓ khoảng trắng ("-", ",", ".") giữa
        // các chữ số giải — nếu cho phép cả khoảng trắng thì dễ khớp NHẦM
        // vào chữ số ĐẦU của 1 khoản tiền đứng sau (VD "g1. 50k" bị hiểu
        // lầm "g1" nối tiếp giải "5" từ "50k" — có khoảng trắng trước "50").
        line = line.replace(/((?:\d{2,4}[\s,.\-]+)+)g([1-8](?:[.,\-]+[1-8])+)((?:[\s,.\-]+(?:db|de))?)\s*\.?\s*((?:x\s*)?\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, (full, numsPart, giaiListPart, dbSuffix, amountRaw) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (!nums.length) return full;
            const types = (giaiListPart.match(/[1-8]/g) || []).map(d => `g${d}`);
            if (dbSuffix) types.push('db');
            if (types.length < 2) return full;
            const amount = /(?:ng|tr|k|n|m)$/i.test(amountRaw) ? amountRaw : `${amountRaw}k`;
            const numStr = nums.join(' ');
            return types.map(t => `${numStr} ${t} ${amount}`).join(' + ') + ' ';
        });
        // "Xiên/Xuyên + Chéo" (hoặc ngược lại) đứng CHUNG 1 cụm, chỉ 1 tiền
        // cuối — khách muốn cược CẢ 2 kiểu độc lập trên CÙNG bộ số (VD "37 70
        // 92. Xuyên+ chéo 1n" = vừa Đá Xiên 3 con VỪA Đá Chéo tách 3 cặp,
        // mỗi kiểu 1k riêng, tính tiền CỘNG DỒN cả 2 — không phải chỉ 1 trong
        // 2). Tách thành 2 cụm độc lập, mỗi cụm lặp lại đủ số + đúng loại +
        // đúng tiền, để vòng lặp bên dưới xử lý y hệt 2 dòng cược riêng biệt
        // (giống cách "+" nối 2 loại cược khác nhau trên cùng số ở nơi khác).
        // Chỉ áp dụng khi có TỪ 3 SỐ TRỞ LÊN (đúng 2 số thì Xiên/Chéo/Thẳng
        // đều là 1, tách ra sẽ tính tiền gấp đôi sai).
        line = line.replace(/((?:\d{2,4}[\s,.\-]+)+)(xien|xuyen|dx)\s*\+\s*(cheo|che|dv)\s+(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, (full, numsPart, t1, t2, amount) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (nums.length < 3) return full;
            const numStr = nums.join(' ');
            return `${numStr} xien ${amount} + ${numStr} cheo ${amount} `;
        });
        line = line.replace(/((?:\d{2,4}[\s,.\-]+)+)(cheo|che|dv)\s*\+\s*(xien|xuyen|dx)\s+(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, (full, numsPart, t1, t2, amount) => {
            const nums = numsPart.match(/\d{2,4}/g) || [];
            if (nums.length < 3) return full;
            const numStr = nums.join(' ');
            return `${numStr} xien ${amount} + ${numStr} cheo ${amount} `;
        });
        line = line.replace(/(\d{2,4})(da|cheo|xien|xuyen)(\d{2,4})/gi, '$1 $2 $3')
            .replace(/(\d{2,4})(db|de)(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)/gi, '$1 $2 $3')
            // Chỉ tách rời khi CẢ CỤM dính liền không phải 1 tổ hợp đã xây
            // riêng (trước đây chỉ loại trừ đúng "g6g3", còn "g7g6"/"g6g5"/
            // "g7g6g5g4"... vẫn bị tách nhầm ra từng giải rời).
            .replace(/(?:g[1-8]){2,}/gi, full => {
                const KNOWN_G_TOKEN_COMBOS = ['g8g7g6g5g4', 'g7g6g5g4', 'g8g7g6g5', 'g7g6g5', 'g7g6', 'g6g5', 'g5g4', 'g3g2', 'g2g1', 'g6g4g3', 'g6g4', 'g4g3', 'g6g3'];
                if (KNOWN_G_TOKEN_COMBOS.includes(full.toLowerCase())) return full;
                return (full.match(/g[1-8]/gi) || []).join(' ');
            });
        // "(?<!\d[,.])" chặn KHÔNG cho số bắt đầu dãy là phần ĐUÔI THẬP PHÂN
        // của 1 khoản tiền đứng ngay trước (VD "chéo 0,5 ..05 đến 95..." —
        // nếu không chặn, "5" trong "0,5" bị hiểu nhầm là ĐIỂM BẮT ĐẦU dãy
        // nối với "05" phía sau qua "..", nuốt mất luôn "0" của "05" thật sự
        // mở đầu cụm kế tiếp). Phải kiểm tra ĐỦ 2 ký tự lùi lại (digit rồi
        // mới tới dấu phẩy/chấm) — chỉ chặn đúng "chấm/phẩy thập phân", KHÔNG
        // được chặn nhầm cả trường hợp "..05" (2 dấu chấm liền là RANH GIỚI
        // cụm, không phải thập phân — số "05" sau đó vẫn phải được nhận làm
        // điểm bắt đầu dãy mới bình thường). "\b" vốn coi phẩy/chấm là ranh
        // giới hợp lệ nên không tự phân biệt được 2 trường hợp này.
        const ranges = /(?<!\d[,.])\b(\d{1,3})\s*(?:den|toi|\.\.|…)\s*(\d{1,3})\b/gi;
        // Dò TRƯỚC toàn bộ dãy số (matchAll, chưa xoá gì) rồi mới xoá SAU
        // theo danh sách đoạn đã gom — trước đây dùng .replace() trực tiếp
        // CHỈ xoá đúng phần "TỪ..ĐẾN" rồi trả về ' ', còn phần LOẠI+TIỀN vừa
        // dò được trong "tail" (chỉ để ĐỌC, không hề bị xoá khỏi dòng) vẫn
        // còn nguyên trong "line" — khiến vòng lặp hits/orderedGroups bên
        // dưới ĐỌC LẠI đúng cụm "loại+tiền" đó lần 2, tự động mượn nhầm dàn
        // số của cụm TRƯỚC ĐÓ (previousNumbers) làm dàn số ảo thứ 2 (trùng
        // lặp 1 phần). Giờ xoá luôn CẢ phần loại+tiền đã tiêu thụ, không chỉ
        // riêng "TỪ..ĐẾN".
        const rangeMatches = [...line.matchAll(ranges)];
        const spansToBlank = [];
        rangeMatches.forEach(m => {
            const start = Number(m[1]), end = Number(m[2]);
            const matchEnd = m.index + m[0].length;
            spansToBlank.push([m.index, matchEnd]);
            const tail = line.slice(matchEnd, matchEnd + 35);
            const money = tail.match(/(?:[=:]|\bx\s*)\s*(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?)|\b(\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m))\b/i);
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            const kind = tail.match(/\b(c2|c3|g8g7g6g5g4|g7g6g5g4|g3g2g1db|g7g6|g6g5|g5g4|g3g2|g2g1|g1db|g6g4g3|g6g4|g4g3|g6g3|g[1-8]lo\d+|g[1-8]|db|de|dc|dd|10lo|10c|5c|4c|3c|2c|3d|8d|10d|12d|13d)\b/i);
            if (amount > 0 && end >= start && end - start <= 99) {
                const width = Math.max(2, m[1].length, m[2].length);
                add(Array.from({ length: end - start + 1 }, (_, i) => String(start + i).padStart(width, '0')), amount, mapBetType(kind?.[1] || 'bl'), 'RANGE');
                if (kind) spansToBlank.push([matchEnd + kind.index, matchEnd + kind.index + kind[0].length]);
                if (money) spansToBlank.push([matchEnd + money.index, matchEnd + money.index + money[0].length]);
            }
        });
        spansToBlank.sort((a, b) => b[0] - a[0]).forEach(([s, e]) => {
            line = line.slice(0, s) + ' ' + line.slice(e);
        });
        const hits = [...line.matchAll(typeRe)];
        if (!hits.length) {
            const money = [...line.matchAll(moneyRe)].pop();
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            const nums = extractNums(line);
            if (amount > 0 && nums.length) {
                nums.forEach(num => {
                    const digits = num.length;
                    add([num], amount, digits >= 4 ? '4c' : (digits === 3 ? '3c' : 'bl'), 'AUTO');
                });
            }
            return;
        }

        // Tin dạng "loại ... số ... giá ... loại ... số ..." cần ưu tiên
        // số sau loại. Chỉ kế thừa số trước đó khi loại mới không có số riêng.
        // Khởi tạo từ carryNumbers (số của cụm liền trước, NẾU ranh giới vào
        // dòng này là "ảo" — xem normalizedForSplit phía trên) để "đb 300k"
        // đứng riêng 1 dòng-ảo vẫn dùng lại đúng số của cụm trước nó.
        const orderedGroups = [];
        let previousNumbers = [...carryNumbers];
        let pendingPatternTypes = [];
        let pendingTierRestrict = [];
        for (let index = 0; index < hits.length; index++) {
            const hit = hits[index];
            const nextIndex = index + 1 < hits.length ? hits[index + 1].index : line.length;
            const beforeStart = index ? hits[index - 1].index + hits[index - 1][0].length : 0;
            const before = line.slice(beforeStart, hit.index);
            const after = line.slice(hit.index + hit[0].length, nextIndex);
            const type = mapBetType(hit[0]);

            // "Gnhat"/"g1"/"g4lo6"/"Db" đứng TRƠ TRỌI (không kèm số cược riêng
            // trước/sau, không kèm tiền riêng) rồi theo sau là 1 loại "cả cụm"
            // → hiểu là GIỚI HẠN cụm đó chỉ so với đúng (các) giải này, gộp
            // OR — khớp 1 TRONG SỐ đó là đủ (VD "Gnhat. Le le x 50k" → chỉ
            // tính trúng khi Giải Nhất về đúng số; "Db+G7. Chan chan x 35k" →
            // trúng khi ĐB HOẶC G7 về đúng số — không tính bao lô như mặc
            // định). Riêng "Db" phải kèm điều kiện KHÔNG có tiền riêng, vì
            // "Đb. 2k" vẫn là cú pháp CŨ (dùng lại số trước đó, có tiền ngay
            // sau) — không được đụng vào, giữ nguyên như trước giờ.
            const isTierWord = /^g[1-8]$/.test(type) || /^g[1-8]lo\d+$/.test(type) || type === 'db';
            if (isTierWord) {
                const hasOwnNumber = extractNums(after.split(/[=:]/)[0]).length > 0 || extractNums(before).length > 0;
                // Đảo ngược thứ tự cũng phải hiểu được (VD "Heo Db 50k"/"Heo
                // G6 G7 30k" — con giáp/cả cụm gõ TRƯỚC, giải/tier gõ SAU):
                // nếu đang có sẵn 1 (hay nhiều) loại "cả cụm" còn TREO CHỜ
                // tiền (pendingPatternTypes chưa rỗng) thì giải/tier này vẫn
                // thuộc về ĐÚNG cụm đó, kể cả khi có tiền ngay sau nó — lúc
                // này rõ ràng không phải câu "Đb. 2k" kiểu cũ (1 dòng Đặc
                // Biệt độc lập, dùng lại số của mệnh đề trước) nữa.
                const continuesPendingPattern = !hasOwnNumber && pendingPatternTypes.length > 0;
                if (continuesPendingPattern) {
                    pendingTierRestrict.push(type);
                    const tierMoneyMatches = [...after.matchAll(moneyRe)];
                    const tierMoney = tierMoneyMatches.find(m => m[1] || m[2]) || tierMoneyMatches.at(-1);
                    const tierAmount = parseAmount(tierMoney?.[1] || tierMoney?.[2] || tierMoney?.[3]);
                    if (tierAmount > 0) {
                        const lastPatternType = pendingPatternTypes[pendingPatternTypes.length - 1];
                        pendingPatternTypes.forEach(t => {
                            orderedGroups.push({ type: t, numbers: [...PATTERN_TYPE_NUMS[t]], amount: tierAmount, tierOnly: [...pendingTierRestrict] });
                        });
                        previousNumbers = [...PATTERN_TYPE_NUMS[lastPatternType]];
                        pendingPatternTypes = [];
                        pendingTierRestrict = [];
                    }
                    continue;
                }

                // Thứ tự thuận (giải/tier gõ TRƯỚC con giáp) — giữ nguyên như
                // trước giờ, không đổi gì ở nhánh này.
                const isBareDb = type === 'db' && ![...after.matchAll(moneyRe)].length;
                // Chỉ nuốt làm "giới hạn giải" khi PHÍA SAU thực sự có 1 loại
                // "cả cụm" (chan_chan/le_le/giap...) đang chờ — nếu không, đây
                // chỉ là 1 mệnh đề BÌNH THƯỜNG muốn dùng lại số của mệnh đề
                // trước (VD "459 bl 10n, giải7 20n" — "giải7" không giới hạn
                // cụm nào cả). Thiếu bước nhìn trước này thì mệnh đề đó bị
                // nuốt mất trắng, không rơi xuống được cơ chế dùng-lại-số.
                let followsPatternType = false;
                if (!hasOwnNumber) {
                    for (let peek = index + 1; peek < hits.length; peek++) {
                        const peekType = mapBetType(hits[peek][0]);
                        if (PATTERN_TYPE_NUMS[peekType]) { followsPatternType = true; break; }
                        // Đá/Chéo/Xiên/Vòng cũng nhận giới hạn giải được (VD
                        // "G4. 12 chéo 34 chéo 56 x10k" → chỉ dò riêng Giải
                        // 4) — khác PATTERN_TYPE_NUMS ở chỗ đá không có dàn
                        // số cố định (số thật lấy ngay trong câu), nên chỉ
                        // cần biết ĐÂY LÀ đá là đủ để nhìn trước; phần gắn
                        // tierOnly thật sự xử lý riêng lúc tạo dòng bên dưới.
                        if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(peekType)) { followsPatternType = true; break; }
                        const peekIsBareTier = /^g[1-8]$/.test(peekType) || /^g[1-8]lo\d+$/.test(peekType) || peekType === 'db';
                        if (!peekIsBareTier) break;
                    }
                }
                if (!hasOwnNumber && (isBareDb || type !== 'db') && followsPatternType) {
                    pendingTierRestrict.push(type);
                    continue;
                }

                // Đá/Chéo/Xiên/Vòng: số của ĐÁ thường nằm NGAY GIỮA tier-word
                // và từ khóa đá (VD "G4. 12 34 56 chéo x10k") — khác hẳn con
                // giáp/chẵn lẻ (không có số riêng), nên KHÔNG dùng chung điều
                // kiện !hasOwnNumber ở trên (numbers ở giữa khiến hasOwnNumber
                // luôn = true). Chỉ cần chắc chắn CHƯA có tiền nào chen giữa —
                // có tiền rồi nghĩa là tier-word đã là 1 dòng cược ĐỘC LẬP
                // xong xuôi, không liên quan gì tới đá đứng sau nó nữa.
                // Chỉ coi là "có tiền riêng" khi thấy tiền RÕ RÀNG (có đơn vị
                // k/n/tr/m/ng, hoặc có tiền tố =/:/x) — dùng moneyRe đầy đủ ở
                // đây sẽ dính nhầm chính SỐ CUỐI của đá (VD "56" trong "G4.
                // 12 34 56 chéo x10k") vì moneyRe có nhánh coi 1 số trơ trọi
                // đứng cuối là tiền thiếu chữ "k" — không đúng ý ở đây.
                const hasExplicitOwnAmount = /(?:[=:]|\bx\s*)\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\b|\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)\b/i.test(after);
                if (!hasExplicitOwnAmount && index + 1 < hits.length) {
                    const nextType = mapBetType(hits[index + 1][0]);
                    if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(nextType)) {
                        pendingTierRestrict.push(type);
                        continue;
                    }
                }
            }

            // Chẵn/Lẻ theo cặp + 12 Con Giáp: dàn số CỐ ĐỊNH có sẵn, không cần
            // gõ tay số nào — chỉ cần tìm đúng số TIỀN đứng sau tên loại. Nhiều
            // loại "cả cụm" đứng liền nhau (VD "le le, le chan x 50k") dùng
            // CHUNG tiền của cụm cuối cùng — mỗi loại vẫn nhân đủ 50k riêng.
            if (PATTERN_TYPE_NUMS[type]) {
                const patternMoneyMatches = [...after.matchAll(moneyRe)];
                const patternMoney = patternMoneyMatches.find(m => m[1] || m[2]) || patternMoneyMatches.at(-1);
                const patternAmount = parseAmount(patternMoney?.[1] || patternMoney?.[2] || patternMoney?.[3]);
                pendingPatternTypes.push(type);
                if (patternAmount > 0) {
                    pendingPatternTypes.forEach(t => {
                        orderedGroups.push({ type: t, numbers: [...PATTERN_TYPE_NUMS[t]], amount: patternAmount, tierOnly: [...pendingTierRestrict] });
                    });
                    previousNumbers = [...PATTERN_TYPE_NUMS[type]];
                    pendingPatternTypes = [];
                    pendingTierRestrict = [];
                }
                continue;
            } else if (pendingPatternTypes.length) {
                // Loại "cả cụm" đứng trước chưa tìm được tiền riêng, nhưng gặp
                // ngay 1 loại KHÁC (không phải cả cụm) — không cùng cụm tiền
                // nữa, bỏ để tránh gán nhầm tiền của clause khác vào.
                pendingPatternTypes = [];
                pendingTierRestrict = [];
            }

            const afterNumbers = extractNums(after.split(/[=:]/)[0]);
            // "before" trải dài từ CUỐI hit trước đó, nên có thể dính luôn
            // phần tiền của clause TRƯỚC (VD "...=10k 03 30" khi hit trước là
            // "Blô 303 =10k" thì before của hit "Đá" là " 303 =10k 03 30 " —
            // lấy nguyên si sẽ dính nhầm "303" từ clause cũ). Chỉ lấy số ở
            // phần SAU dấu tiền gần nhất trong "before" để tránh dính nhầm.
            const lastMoneyInBefore = [...before.matchAll(/(?:[=:]\s*)?\d+(?:[.,/]\d+)?(?:k|n|tr|m|ng)\b/gi)].pop();
            const beforeFresh = lastMoneyInBefore ? before.slice(lastMoneyInBefore.index + lastMoneyInBefore[0].length) : before;
            const beforeNumbers = extractNums(beforeFresh);
            const explicitAmounts = [...after.matchAll(/\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)\b/gi)];
            // Đá/Xiên quy ước viết "SỐ1 đá SỐ2" — số đầu đứng TRƯỚC từ khóa.
            // Vòng lặp này trước đây chỉ lấy afterNumbers, làm rớt mất số
            // đứng trước (VD "79 đá 37 =60k" → chỉ còn "37", thiếu "79" nên
            // không đủ 2 số để ghép cặp và bị bỏ qua hoàn toàn).
            const isPairType = ['da', 'dx', 'dv', 'cheo', 'xien'].includes(type);
            // Loại được phép "dùng lại số cũ" khi không có số riêng — tính
            // TRƯỚC ở đây (không chỉ trong nhánh else bên dưới) để dùng
            // được luôn cho fallback bên trong vòng lặp explicitAmounts.
            const reusableTypeForFallback = /^(4c|5c|10c|db|g[1-8]|g[1-8]lo\d+)$/.test(type) || isPairType;
            if (afterNumbers.length && explicitAmounts.length) {
                let clauseStart = 0;
                explicitAmounts.forEach((amountMatch, amtIdx) => {
                    const clauseNumberText = after.slice(clauseStart, amountMatch.index);
                    let clauseNumbers = extractNums(clauseNumberText);
                    if (isPairType && amtIdx === 0 && beforeNumbers.length) {
                        clauseNumbers = [...beforeNumbers, ...clauseNumbers];
                    } else if (!isPairType && amtIdx === 0 && !clauseNumbers.length && beforeNumbers.length) {
                        // Loại không phải cặp (g3/g4/db/4c/5c...) mà số của
                        // CHÍNH NÓ nằm TRƯỚC từ khóa (VD "03 30 g3 3k + 03 30
                        // g4 3k" — số "03 30" của "g3" nằm trong before, còn
                        // clauseNumberText lúc này chỉ có mỗi tiền, trống số).
                        // Không lấy bước này thì mọi mệnh đề "+"-nối nhau (trừ
                        // mệnh đề CUỐI) đều mất trắng số, chỉ dòng cuối sống sót.
                        clauseNumbers = beforeNumbers;
                    }
                    // Không có số nào đứng NGAY TRƯỚC khoản tiền này — nhưng
                    // "afterNumbers" (dùng để chọn nhánh if/else phía trên)
                    // lại thấy có số, vì số đó thực ra thuộc về MỆNH ĐỀ SAU
                    // (VD "giải 7/100k.689 g7 42k" — "689" nằm sau "100k",
                    // là số của cụm "g7 42k" kế tiếp, không phải của "giải
                    // 7/100k"). Nếu loại này được dùng lại số cũ và đã có số
                    // của mệnh đề trước, dùng lại số đó thay vì bỏ trắng.
                    if (!clauseNumbers.length && reusableTypeForFallback && previousNumbers.length) {
                        clauseNumbers = previousNumbers;
                    }
                    const amount = parseAmount(amountMatch[0]);
                    // "=" (hoặc ":") ngay trước số tiền này → TỔNG CUỐI CÙNG, không
                    // phải giá mỗi lô (xem giải thích ở nhánh "else" phía dưới).
                    const isTotalAmount = /[=:]\s*$/.test(clauseNumberText);
                    if (clauseNumbers.length && amount > 0) {
                        // Đá/Chéo/Xiên/Vòng có sẵn giới hạn giải treo từ mệnh
                        // đề trước (VD "G4. 12 chéo 34 chéo 56 x10k") → gắn
                        // luôn vào dòng này, chỉ dò đúng giải đó thay vì bao
                        // lô mặc định. Dùng xong xóa ngay, không để dính sang
                        // mệnh đề khác không liên quan.
                        const pairTierOnly = (isPairType && pendingTierRestrict.length) ? [...pendingTierRestrict] : undefined;
                        orderedGroups.push({ type, numbers: [...new Set(clauseNumbers)], amount, isTotalAmount, ...(pairTierOnly ? { tierOnly: pairTierOnly } : {}) });
                        previousNumbers = [...new Set(clauseNumbers)];
                        if (pairTierOnly) pendingTierRestrict = [];
                    }
                    clauseStart = amountMatch.index + amountMatch[0].length;
                });
            } else {
                // Tin kiểu "00.33.44 bl 3. Chéo 0/5. Db 20" — Chéo/Db không có
                // số riêng, ý là dùng LẠI đúng 00,33,44 ở trên, còn "0/5"/"20"
                // chỉ là TIỀN. Nếu đúng 1 số trơ trọi phía sau (không đơn vị,
                // không số nào khác quanh từ khóa) và đã có số của cụm trước
                // đó, thì hiểu là tiền tiếp tục dùng số cũ — chứ không phải
                // số cược mới — mới đúng ý người gõ.
                // Mở rộng thêm "g1".."g8" và "g_lo_" (VD "giải7"/"g4lo6") vào
                // danh sách được DÙNG LẠI SỐ CŨ khi đứng 1 mình không kèm số
                // riêng — trước đây chỉ 4c/5c/10c/db được vậy, nên 1 dòng kiểu
                // "459 bl 10n, giải7 20n, đb 100n" bị RỚT hẳn mệnh đề "giải7"
                // (không có cơ chế nào cho nó mượn lại số 459 ở trên).
                const reusableType = /^(4c|5c|10c|db|g[1-8]|g[1-8]lo\d+)$/.test(type) || isPairType;
                const singleBareTrailing = afterNumbers.length === 1 && !beforeNumbers.length;
                // "24 bl 10." — "10" đứng ngay sau loại cược nhưng KHÔNG có đơn vị
                // (k/n/…) nên không lọt vào nhánh explicitAmounts phía trên; nếu
                // không chặn ở đây, "10" bị hiểu lầm là THÊM 1 SỐ CƯỢC (mất số 24
                // đứng trước, cược nhầm sang số 10). Loại không phải kiểu cặp (đá)
                // + đã có số đứng trước + chỉ đúng 1 số trơ trọi phía sau → số đó
                // gần như chắc chắn là TIỀN thiếu chữ "k", không phải số cược mới.
                const bareAfterIsLikelyAmount = !isPairType && afterNumbers.length === 1 && beforeNumbers.length > 0;
                let numbers;
                if (reusableType && previousNumbers.length && singleBareTrailing) {
                    numbers = previousNumbers;
                } else if (bareAfterIsLikelyAmount) {
                    numbers = beforeNumbers;
                } else if (afterNumbers.length) {
                    numbers = (isPairType && beforeNumbers.length) ? [...beforeNumbers, ...afterNumbers] : afterNumbers;
                } else if (beforeNumbers.length) {
                    // Không có số sau từ khóa → thử số ĐỨNG TRƯỚC (mọi loại,
                    // không riêng gì 4c/5c/10c/db/đá — VD "00.33.44 bl 3").
                    numbers = beforeNumbers;
                } else if (reusableType) {
                    numbers = previousNumbers;
                } else {
                    numbers = [];
                }
                const moneyMatches = [...after.matchAll(moneyRe)];
                const money = moneyMatches.find(match => match[1] || match[2]) || moneyMatches.at(-1);
                const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
                // Có "=" (hoặc ":") ngay trước số tiền — CHO PHÉP có khoảng trắng ở
                // giữa ("= 50") — nghĩa là TỔNG CUỐI CÙNG đúng bằng số đó (chia
                // ngược ra từng số/lô), KHÔNG PHẢI giá mỗi lô rồi nhân thêm như
                // khi không có "=". Phải kiểm tra CẢ 2 kiểu: "=" dính liền số tiền
                // (nằm NGAY TRONG money[0], VD "=100") lẫn "=" có khoảng trắng
                // (nằm ở phần TRƯỚC vị trí khớp, VD "= 50") — 2 kiểu khớp qua 2
                // nhánh khác nhau của moneyRe nên không thể chỉ kiểm tra 1 chỗ.
                const isTotalAmount = money
                    ? /^[=:]/.test(money[0]) || /[=:]\s*$/.test(after.slice(0, money.index))
                    : false;
                if (numbers.length && amount > 0) {
                    // Cùng logic gắn tierOnly cho đá/chéo/xiên/vòng như nhánh
                    // explicitAmounts phía trên — cần lặp lại ở đây vì tiền
                    // kiểu dính liền không khoảng trắng ("x10k") rơi vào
                    // nhánh else này (không khớp \b trước số của explicitAmounts).
                    const pairTierOnly = (isPairType && pendingTierRestrict.length) ? [...pendingTierRestrict] : undefined;
                    orderedGroups.push({ type, numbers: [...new Set(numbers)], amount, isTotalAmount, ...(pairTierOnly ? { tierOnly: pairTierOnly } : {}) });
                    previousNumbers = [...new Set(numbers)];
                    if (pairTierOnly) pendingTierRestrict = [];
                }
            }
        }
        // Lưu lại số cuối cùng của dòng này — nếu dòng KẾ TIẾP là ranh giới
        // "ảo" (cùng tin gốc), nó sẽ được phép dùng lại đúng số này.
        carryNumbers = [...previousNumbers];

        // Gộp loại có số riêng với các loại rỗng phía sau não bộ cũ không còn
        // được phép kéo số ngược từ một nhóm đã kết thúc.
        if (orderedGroups.length) {
            orderedGroups.forEach((group, groupIndex) => {
                if (group.isTotalAmount) {
                    // Có "=" → group.amount là TỔNG CUỐI CÙNG, không phải giá mỗi
                    // lô. Tạo tạm với giá 1k/số để ĐO đúng số lô/số dòng thật của
                    // loại cược này (qua calculateItemFinancials — không tự tính
                    // lại luật lô ở đây, tránh lệch với công thức tính tiền chính),
                    // rồi suy ngược ra giá mỗi số sao cho tổng khớp đúng ý người gõ.
                    // Ghi chú hiển thị tên đọc được (VD "Tỵ (Rắn)") thay vì mã
                    // thô (VD "RAN") — nhìn vào bảng chi tiết biết ngay đây là
                    // cược con giáp/chẵn lẻ nào, khỏi phải đoán qua mã viết tắt.
                    const noteText = getRegionAwareTypeName(group.type, region);
                    const created = add(group.numbers, 1, group.type, noteText, `group-${groupIndex}`, group.tierOnly || '');
                    if (created.length && typeof calculateItemFinancials === 'function') {
                        const costFor1k = created.reduce((sum, it) => sum + calculateItemFinancials(it, region).totalItemCost, 0);
                        if (costFor1k > 0) {
                            const scale = (group.amount * 1000) / costFor1k;
                            created.forEach(it => {
                                it.originalAmount = Math.round(it.originalAmount * scale * 100) / 100;
                                it.amount = it.originalAmount * 1000;
                            });
                        }
                    }
                } else {
                    const noteText2 = getRegionAwareTypeName(group.type, region);
                    add(group.numbers, group.amount, group.type, noteText2, `group-${groupIndex}`, group.tierOnly || '');
                }
            });
            return;
        }

        let previousNums = [];
        hits.forEach((match, index) => {
            const previousEnd = index ? hits[index - 1].index + hits[index - 1][0].length : 0;
            const before = line.slice(previousEnd, match.index);
            const after = line.slice(match.index + match[0].length, index + 1 < hits.length ? hits[index + 1].index : line.length);
            const type = mapBetType(match[0]);
            const moneyMatches = [...after.matchAll(moneyRe)];
            const money = moneyMatches.find(match => match[1] || match[2]) || moneyMatches.at(-1);
            const amount = parseAmount(money?.[1] || money?.[2] || money?.[3]);
            // Phần đứng giữa hai loại thường là giá của loại trước ("bl 10. db 20").
            const numberSource = index && /\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\s*[.+]?\s*$/i.test(before) ? '' : before;
            let nums = extractNums(numberSource);
            const numsAfterType = extractNums(after.split(/[=:]|\bx\s*/i)[0].replace(/\b\d+(?:[.,/]\d+)?(?:ng|tr|k|n|m)?\s*[.+]?\s*$/i, ''));
            if (!nums.length && numsAfterType.length) nums = numsAfterType;
            if (!nums.length) nums = [...previousNums]; else previousNums = [...nums];
            if (['da', 'dx', 'dv', 'cheo', 'xien'].includes(type)) {
                nums = [...nums, ...extractNums(after.split(/[=:]|\bx\s*/i)[0])];
                previousNums = [...nums];
            }
            // '=' / ':' means the amount belongs to the whole number group.
            const isSharedAmount = /[=:]/.test(after);
            add(nums, isSharedAmount ? amount / Math.max(nums.length, 1) : amount, type, match[0].toUpperCase());
        });
    });

    // Cảnh báo "g{giải}lo{số}" (VD "G5lo3") mà VỊ TRÍ ĐÓ KHÔNG TỒN TẠI ở
    // đúng miền của dòng đó — VD Trung/Nam Giải 5 CHỈ có 1 lô (xem KQXS thật:
    // "G5 0818" — đúng 1 số), "G5lo3" chỉ có nghĩa ở Miền Bắc (Giải 5 Bắc có
    // 6 lô). Không chặn/xóa dòng (khách có thể đang nhập đúng miền khác, chỉ
    // quên đổi đài) — chỉ báo 1 lần cho mỗi tổ hợp giải+miền để không tạo
    // dòng cược ÂM THẦM KHÔNG BAO GIỜ TRÚNG (vị trí không tồn tại để so
    // khớp) mà không ai biết vì sao mất tiền cược vô ích.
    // Toast dễ bị lướt qua mất (tự tắt sau vài giây) — nên NGOÀI toast, còn
    // gom lại thành danh sách để nơi gọi (VD showSmartPreview) có thể hiện
    // hẳn 1 banner CỐ ĐỊNH kèm nút "Bỏ Dòng Này" ngay trong khung xem lại,
    // không tự biến mất, người dùng chắc chắn thấy trước khi bấm Xác Nhận.
    if (typeof window !== 'undefined') {
        window._pendingGLoWarning = [];
        window._pendingGLoInvalidTypes = [];
    }
    const gLoWarned = new Set();
    results.forEach(item => {
        const gLo = String(item.betType || '').match(/^g([1-8])lo(\d+)$/);
        if (!gLo) return;
        const itemRegion = item.region || region;
        const warnKey = `${gLo[1]}-${gLo[2]}-${itemRegion}`;
        if (gLoWarned.has(warnKey)) return;
        const maxLo = (typeof getPrizeCount === 'function') ? getPrizeCount('g' + gLo[1], itemRegion) : null;
        if (maxLo != null && Number(gLo[2]) > maxLo) {
            gLoWarned.add(warnKey);
            const regionLabel = itemRegion === 'MB' ? 'Miền Bắc' : 'Miền Trung/Nam';
            const betTypeKey = `g${gLo[1]}lo${gLo[2]}`;
            if (typeof showToast === 'function') {
                showToast(`⚠️ Giải ${gLo[1]} ở ${regionLabel} chỉ có ${maxLo} lô — "G${gLo[1]}lo${gLo[2]}" không tồn tại, kiểm tra lại giải/miền kẻo cược vô ích`, 'error');
            }
            if (typeof window !== 'undefined') {
                window._pendingGLoWarning.push(`Giải ${gLo[1]} ở <b>${regionLabel}</b> chỉ có <b>${maxLo} lô</b> — <b>"G${gLo[1]}lo${gLo[2]}"</b> không tồn tại, các dòng này sẽ KHÔNG BAO GIỜ trúng.`);
                window._pendingGLoInvalidTypes.push(betTypeKey);
            }
        }
    });

    return results.filter(item => Number(item.originalAmount) > 0);
}

// Nhãn dễ hiểu cho tierOnly (1 hoặc nhiều giải kết hợp, VD ['db','g7']) — hiển
// thị THẲNG ở cột "Loại cược" (thay vì chỉ ghi trong Ghi chú) vì đây mới là
// thứ cần nhìn để dò tay đối chiếu: dò đúng giải nào, không cần đoán hay lật
// lại tin nhắn gốc. Nhiều giải kết hợp ghi nối bằng " + " (VD "Đặc Biệt +
// Giải 7"), khớp trúng khi 1 TRONG SỐ các giải đó về đúng.
function describeTierOnly(tierOnly) {
    const list = Array.isArray(tierOnly) ? tierOnly : (tierOnly ? [tierOnly] : []);
    if (!list.length) return '';
    return list.map(source => {
        const t = String(source).toLowerCase();
        const gLo = t.match(/^g([1-8])lo(\d+)$/);
        if (gLo) return `Giải ${gLo[1]} (Lô ${gLo[2]})`;
        const g = t.match(/^g([1-8])$/);
        if (g) return `Giải ${g[1]}`;
        if (t === 'db') return 'Đặc Biệt';
        return t.toUpperCase();
    }).join(' + ');
}

// Nhãn "🎯 ..." cho biết BÊN TRONG 1 loại cược đang thật sự dò những giải
// nào — trước đây chỉ hiện khi gõ kiểu "Db. Heo x 50k" (tierOnly do người
// dùng tự giới hạn). Nhưng nhiều loại CỐ ĐỊNH sẵn có (5 Cuối, 12 Đầu, 13
// Đầu, Đầu Đuôi, Xỉu Chủ...) cũng là gộp nhiều giải, mà dropdown chỉ ghi
// tên chung chung — không tự suy ra được bên trong gồm giải nào nếu không
// thuộc lòng luật. Hàm này dùng getBetTypeTiers() để tra ra đúng các giải
// cố định đó, tái dùng lại đúng nhãn "🎯 Giải X + Giải Y" quen thuộc.
function getDisplayTierBadge(item, region) {
    const dynamicTiers = (Array.isArray(item.tierOnly) && item.tierOnly.length) ? item.tierOnly : null;
    // Mã "Cược tổng hợp" (VD 'g3g2g1db') có TÊN đã tự ghi rõ đủ giải bên
    // trong rồi — hiện thêm badge chỉ lặp lại y chang, dư thừa. Quy về mã
    // hiển thị trước khi so (getManualTypeKey) để dữ liệu CŨ lỡ lưu mã viết
    // tắt ('5c'/'12d'/'13d') cũng được nhận đúng, không hiện badge dư nữa.
    if (!dynamicTiers && SELF_DESCRIBING_TIER_TYPES.includes(getManualTypeKey(item.betType))) return '';
    // "g{giải}lo{số}" (VD "g5lo3") — dropdown TỰ ghi rõ "Giải 5 - Lô 3" rồi,
    // hiện thêm badge sẽ mất chữ "Lô 3" (getBetTypeTiers chỉ trả về ['g5'],
    // không giữ số vị trí) — dễ hiểu lầm là đang dò CẢ Giải 5, không phải
    // đúng 1 lô cụ thể. Coi như tự mô tả sẵn, không hiện thêm badge nữa.
    if (!dynamicTiers && /^g[1-8]lo\d+$/.test(String(item.betType || '').toLowerCase())) return '';
    const tiers = dynamicTiers || (typeof getBetTypeTiers === 'function' ? getBetTypeTiers(item.betType, region) : null);
    if (!Array.isArray(tiers) || !tiers.length) return '';
    // Loại chỉ gồm ĐÚNG 1 giải trùng tên chính nó (VD 'db'->['db'], 'g5'->
    // ['g5']) thì dropdown đã tự nói rõ rồi — hiện thêm badge chỉ dư thừa.
    if (!dynamicTiers && tiers.length === 1 && tiers[0] === String(item.betType || '').toLowerCase()) return '';
    return describeTierOnly(tiers);
}

function createItem(num, amountInK, region, betType, note = '', prizeTag = '', tierOnly = '') {
    const rawNum = String(num || '');
    const baseNum = rawNum.split('-')[0];
    const digits = baseNum.length >= 4 ? 4 : (baseNum.length >= 3 ? 3 : 2);
    const padded = rawNum.includes('-') ? rawNum : rawNum.padStart(digits, '0');
    const now = new Date();
    const kVal = Number(amountInK) || 0;
    const reg = region || 'MT';

    // Gõ "blô"/"bao lô" cho số 3 chữ số vẫn ra 'bl' ("Bao Lô (2C)") — tiền tính
    // đúng (đã theo digits) nhưng NHÃN sai/gây hiểu lầm là 2 càng. Số 3 chữ số
    // thì đổi đúng sang '3c' ("Bao Lô 3C") ngay lúc tạo dòng, khỏi lệch ở mọi
    // nơi hiển thị sau này.
    let resolvedBetType = betType || 'bl';
    if (resolvedBetType === 'bl' && digits === 3) resolvedBetType = '3c';

    const resolvedStations = (typeof resolveStations === 'function') 
        ? resolveStations(reg) 
        : (typeof selectedStations !== 'undefined' ? [...selectedStations] : []);

    return {
        id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        num: padded,
        digits: digits,
        originalAmount: kVal,
        amount: kVal * 1000,
        region: reg,
        betType: resolvedBetType,
        note: note,
        prizeTag: prizeTag,
        tierOnly: (Array.isArray(tierOnly) && tierOnly.length) ? tierOnly : '',
        matched: false,
        matchCount: 0,
        winAmount: 0,
        stations: resolvedStations,
        prizeInfo: '',
        createdAt: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + now.toLocaleDateString('vi-VN'),
        createdAtTimestamp: now.getTime(),
		dateStr: now.toLocaleDateString('vi-VN')
    };
}

function getAutoStations(region) {
    if (typeof getTodayStations === 'function') {
        const today = getTodayStations(region || 'MT');
        return today.length ? [...today] : [];
    }
    return [];
}

function getMainStation(region) {
    if (typeof getTodayStations === 'function') {
        const today = getTodayStations(region || 'MT');
        return today.length ? [today[0]] : [];
    }
    return [];
}

// ================= TỶ LỆ CƯỢC (có lưu LocalStorage) =================
const RATE_STORAGE_KEY = "SEA_LOTTO_CUSTOM_RATES";

let CUSTOM_RATES = {
    c2: 91,   // 2 Càng
    c3: 780,  // 3 Càng
    da: 780   // Đá / Chéo / Xiên
};

function loadCustomRates() {
    try {
        const saved = localStorage.getItem(RATE_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                CUSTOM_RATES = { ...CUSTOM_RATES, ...parsed };
            }
        }
    } catch (e) {
        console.warn("Không load được tỷ lệ đã lưu", e);
    }
}

function saveCustomRates() {
    try {
        localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(CUSTOM_RATES));
    } catch (e) {
        console.warn("Không lưu được tỷ lệ", e);
    }
}

function updateCustomRate(type, val) {
    const num = parseFloat(val);
    if (num > 0) {
        CUSTOM_RATES[type] = num;
        if (typeof saveCustomRates === 'function') saveCustomRates();

        // Tính lại winAmount cho tất cả item đã trúng
        if (typeof groups !== 'undefined' && Array.isArray(groups)) {
            groups.forEach(g => {
                const list = appData[g]?.betList || [];
                list.forEach(item => {
                    if (item.matched || (item.winAmount && item.winAmount > 0)) {
                        const fin = calculateItemFinancials(item, item.region || 'MT');
                        item.winAmount = fin.winAmount;
                    }
                });
                if (typeof recalculateTotals === 'function') recalculateTotals(g);
            });
        }

        if (typeof showToast === 'function') {
            showToast(`Đã đổi tỷ lệ ${type.toUpperCase()} thành ${num}`, 'info');
        }
        if (typeof renderMatrixTable === 'function') renderMatrixTable();
        if (typeof updateGrandSummary === 'function') updateGrandSummary();
    }
}

function applyCustomRatesToUI() {
    // Tìm chính xác theo onchange
    const c2 = document.querySelector('input[onchange*="\'c2\'"]') || document.querySelector('input[onchange*="c2"]');
    const c3 = document.querySelector('input[onchange*="\'c3\'"]') || document.querySelector('input[onchange*="c3"]');
    const da = document.querySelector('input[onchange*="\'da\'"]') || document.querySelector('input[onchange*="da"]');

    if (c2) c2.value = CUSTOM_RATES.c2;
    if (c3) c3.value = CUSTOM_RATES.c3;
    if (da) da.value = CUSTOM_RATES.da;
}

// ================= BẢNG XEM LẠI & TRẢ SỐ (REVIEW & REFUND) =================

function showInputComparison(newItems) {
    pendingInputItems = newItems;
    inputSessionCount++;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN') + ' - ' + now.toLocaleDateString('vi-VN');
    const stationsStr = (typeof selectedStations !== 'undefined' && selectedStations.length)
        ? selectedStations.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join(', ')
        : 'Chưa chọn';

    let html = `
        <div style="max-height:55vh; overflow:auto; font-size:13px;">
            <p style="color:#94a3b8; margin-bottom:8px;">
                <b>Lần nhập #${inputSessionCount}</b> | ${timeStr} | Đài: <b style="color:#fbbf24;">${stationsStr}</b>
            </p>
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#0f172a; color:#00f3ff;">
                        <th style="padding:6px; border:1px solid #334155;">#</th>
                        <th style="padding:6px; border:1px solid #334155;">Số</th>
                        <th style="padding:6px; border:1px solid #334155;">Loại</th>
                        <th style="padding:6px; border:1px solid #334155;">Tiền (k)</th>
                        <th style="padding:6px; border:1px solid #334155;">Ghi chú</th>
                        <th style="padding:6px; border:1px solid #334155;">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
    `;

    newItems.forEach((item, idx) => {
        const bg = idx % 2 === 0 ? '#1e293b' : '#0f172a';
        const origK = item.originalAmount || (item.amount / 1000) || 0;
        html += `
            <tr style="background:${bg};" id="review-row-${idx}">
                <td style="padding:5px; border:1px solid #334155; text-align:center; color:#64748b;">${idx + 1}</td>
                <td style="padding:5px; border:1px solid #334155; font-weight:bold; color:#00f3ff; text-align:center;">${item.num}</td>
                <td style="padding:5px; border:1px solid #334155; text-align:center; color:#f472b6;">${(item.betType || '').toUpperCase()}</td>
                <td style="padding:5px; border:1px solid #334155; text-align:center;">
                    <input type="number" value="${origK}" style="width:70px; background:#0f172a; border:1px solid #334155; color:#00ff88; text-align:center; font-weight:bold;"
                           onchange="pendingInputItems[${idx}].originalAmount = parseFloat(this.value) || 0; pendingInputItems[${idx}].amount = (parseFloat(this.value) || 0) * 1000;">
                </td>
                <td style="padding:5px; border:1px solid #334155; font-size:12px; color:#94a3b8;">${item.note || ''}</td>
                <td style="padding:5px; border:1px solid #334155; text-align:center;">
                    <button class="btn btn-sm btn-red" style="padding:2px 6px; font-size:11px;" onclick="removePendingItem(${idx})">Xóa</button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-green" onclick="confirmPendingInput()">✅ Xác nhận nạp</button>
                <button class="btn btn-gray" onclick="cancelPendingInput()">Hủy</button>
            </div>
            <div style="margin-top:12px; border-top:1px solid #334155; padding-top:10px;">
                <b style="color:#fbbf24;">Trả số (Refund):</b><br>
                <input type="text" id="refund-input" placeholder="Ví dụ: 68 200 hoặc hàng 3 150"
                       style="width:100%; padding:8px; margin-top:6px; background:#1e293b; border:1px solid #00f3ff; color:#fff; border-radius:6px;">
                <button class="btn btn-orange" style="margin-top:6px;" onclick="processRefund()">Trả số</button>
            </div>
        </div>
    `;

    if (typeof showModal === 'function') {
        showModal({
            title: "Bảng Xem Lại – Chỉnh sửa trước khi nạp",
            body: html,
            isPrompt: false
        });
    }
}

function removePendingItem(idx) {
    pendingInputItems.splice(idx, 1);
    showInputComparison(pendingInputItems);
}

function processRefund() {
    const input = document.getElementById('refund-input')?.value.trim();
    if (!input) {
        if (typeof showToast === 'function') showToast("Vui lòng nhập lệnh trả số", "error");
        return;
    }

    const matchNum = input.match(/^(\d{2,3})\s*(?:trả|tra)?\s*([\d.,]+[kntr]?)$/i);
    const matchRow = input.match(/^hàng\s*(\d+)\s*(?:trả|tra)?\s*([\d.,]+[kntr]?)$/i);

    if (matchNum) {
        applyRefundByNumber(matchNum[1], parseAmount(matchNum[2]));
    } else if (matchRow) {
        applyRefundByRow(parseInt(matchRow[1], 10) - 1, parseAmount(matchRow[2]));
    } else {
        if (typeof showToast === 'function') showToast("Định dạng sai. Ví dụ:\n68 200\nhàng 3 150", "error");
    }
}

function applyRefundByNumber(num, refundAmountK) {
    const item = pendingInputItems.find(i => i.num === num);
    if (!item) {
        if (typeof showToast === 'function') showToast(`Không tìm thấy số ${num}`, "error");
        return;
    }
    if (refundAmountK <= 0) {
        if (typeof showToast === 'function') showToast("Số tiền trả phải > 0", "error");
        return;
    }

    const original = item.originalAmount || (item.amount / 1000);
    if (refundAmountK >= original) {
        item.originalAmount = 0;
        item.amount = 0;
        item.note = `Đã trả hết (gốc ${original}k)`;
    } else {
        item.originalAmount = Math.round((original - refundAmountK) * 100) / 100;
        item.amount = item.originalAmount * 1000;
        item.note = `Gốc ${original}k → còn ${item.originalAmount}k`;
    }

    showInputComparison(pendingInputItems);
    if (typeof showToast === 'function') showToast(`Đã trả ${refundAmountK}k cho số ${num}`, "success");
}

function applyRefundByRow(rowIndex, refundAmountK) {
    if (rowIndex < 0 || rowIndex >= pendingInputItems.length) {
        if (typeof showToast === 'function') showToast("Số hàng không hợp lệ", "error");
        return;
    }
    applyRefundByNumber(pendingInputItems[rowIndex].num, refundAmountK);
}

function confirmPendingInput() {
    if (!pendingInputItems || pendingInputItems.length === 0) return;

    const activeG = typeof activeGroup !== 'undefined' ? activeGroup : null;
    if (!activeG || !appData?.[activeG]) return;

    const gObj = appData[activeG];
    if (!Array.isArray(gObj.inputHistory)) gObj.inputHistory = [];
    if (!Array.isArray(gObj.betList)) gObj.betList = [];

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + now.toLocaleDateString('vi-VN');
    
    const validItems = JSON.parse(JSON.stringify(pendingInputItems.filter(i => (i.amount || 0) > 0)));
    if (validItems.length === 0) {
        if (typeof showToast === 'function') showToast("Không có số nào hợp lệ để nhập", "error");
        return;
    }

    const session = {
        id: Date.now(),
        time: timeStr,
        region: validItems[0]?.region || 'MT',
        items: validItems,
        stations: (typeof selectedStations !== 'undefined') ? [...selectedStations] : []
    };

    gObj.inputHistory.push(session);
    gObj.betList.push(...validItems);

    if (typeof recalculateTotals === 'function') recalculateTotals(activeG);
    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    const smartInput = document.getElementById('smart-input');
    if (smartInput) smartInput.value = '';

    pendingInputItems = [];
    if (typeof showToast === 'function') showToast(`Đã nạp thành công ${validItems.length} số!`, "success");
}

function cancelPendingInput() {
    pendingInputItems = [];
    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof showToast === 'function') showToast("Đã hủy lần nhập", "info");
}

// ================= NHẬP NHANH THÔNG MINH (SMART INPUT) =================
function processSmartInput() {
        const raw = document.getElementById('smart-input')?.value?.trim() || '';
    if (!raw) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập hoặc dán nội dung!', 'error');
        return;
    }
    const region = (typeof detectRegionFromText === 'function')
        ? detectRegionFromText(raw, document.querySelector('input[name="region-select"]:checked')?.value || 'MT')
        : (document.querySelector('input[name="region-select"]:checked')?.value || 'MT');
    const radio = document.querySelector(`input[name="region-select"][value="${region}"]`);
    if (radio) radio.checked = true;
    let items = [];
    try {
        items = parseSmartLottoText(raw, region) || [];
    } catch (err) {
        console.error("Lỗi Parser:", err);
        if (typeof showToast === 'function') showToast('Lỗi phân tích nội dung!', 'error');
        return;
    }

    if (items.length === 0) {
        if (typeof customAlert === 'function') {
            customAlert('Không nhận được số hợp lệ nào.<br>Hãy kiểm tra lại cú pháp (bl, đá, 5k, 20-30…).', 'Không có dữ liệu');
        }
        return;
    }

    const stationsToUse = (typeof resolveStations === 'function')
        ? resolveStations(region)
        : ((typeof selectedStations !== 'undefined' && selectedStations.length > 0)
            ? [...selectedStations]
            : (typeof getMainStation === 'function' ? getMainStation(region) : []));

    items.forEach(it => {
        if (!it.stations || it.stations.length === 0) {
            it.stations = [...stationsToUse];
        }
        if (!it.region) it.region = region;
    });

    // Cảnh báo nhẹ (không chặn) nếu nội dung nhắc tới đài khác đài đang chọn
    // để nhập — VD gõ "Vĩnh Long" nhưng đài đang chọn lại là đài khác.
    if (typeof detectMentionedStations === 'function') {
        const mentioned = detectMentionedStations(raw);
        const mismatched = mentioned.filter(s => !stationsToUse.includes(s));
        window._pendingStationWarning = mismatched.length
            ? `⚠️ Nội dung có nhắc tới đài <b>${mismatched.join(', ')}</b>, nhưng đài đang chọn để nhập là <b>${stationsToUse.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) || s).join(', ') || 'chưa chọn'}</b> — kiểm tra lại nếu không đúng ý.`
            : '';
    }

    if (skipComparisonModal) {
        commitSmartItems(items);
        return;
    }

    showSmartPreview(items);
}

function resetModalSize() {
    const card = document.querySelector('#custom-modal-overlay .modal-card');
    if (card) {
        card.removeAttribute('id');
        card.style.maxWidth = '';
        card.style.width = '';
    }
}

function updatePendingSmartField(index, field, value, refresh = true) {
    const item = window._pendingSmartItems?.[index];
    if (!item) return;
    if (field === 'originalAmount') {
        item.originalAmount = Math.max(0, Number(value) || 0);
        item.amount = item.originalAmount * 1000;
    } else if (field === 'num') {
        item.num = String(value).replace(/\s+/g, '');
        const first = item.num.split('-')[0] || '';
        item.digits = first.length >= 4 ? 4 : (first.length >= 3 ? 3 : 2);
        item.pairNums = item.num.includes('-') ? item.num.split('-').filter(Boolean) : undefined;
    } else if (field === 'betType') item.betType = mapBetType(value);
    if (refresh) renderSmartPreviewContent();
}

function updatePendingSmartStation(index, select) {
    const item = window._pendingSmartItems?.[index];
    if (!item) return;
    item.stations = [...select.selectedOptions].map(option => option.value);
    renderSmartPreviewContent();
}

function removePendingSmartItem(index) {
    if (!window._pendingSmartItems) return;
    window._pendingSmartItems.splice(index, 1);
    renderSmartPreviewContent();
}

function renderSmartPreviewContent() {
    const items = window._pendingSmartItems || [];
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const typeOptions = (item, region) => getManualBetTypeOptions(getDropdownDisplayType(item.betType), region);
    let total = 0;
    const groups = new Map();
    items.forEach((item, index) => {
        const key = item.linkId || `item-${index}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ item, index });
    });
    let groupNumber = 0;
    const rows = [...groups.values()].map(group => {
        groupNumber += 1;
        const groupLabel = `Cụm ${String(groupNumber).padStart(2, '0')}`;
        const groupNumbers = [...new Set(group.map(entry => entry.item.num))].join(', ');
        const groupRows = group.map(({ item, index }) => {
        const region = item.region || document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
        const stations = [...new Set([...getTodayStations(region), ...(item.stations || []), ...selectedStations])];
        const selected = item.stations?.length ? item.stations : selectedStations;
        const financials = calculateItemFinancials(item, region);
        total += financials.totalItemCost;
        const stationOptions = stations.map(station => `<option value="${esc(station)}" ${selected.includes(station) ? 'selected' : ''}>${esc(STATION_ABBR[station] || station)}</option>`).join('');
        const stationLabel = selected.length
            ? selected.map(station => STATION_ABBR[station] || station).join('+')
            : 'Đài chính';
        return `<tr class="smart-review-item ${index % 2 ? 'is-alt' : ''}">
            <td class="smart-review-index">${index + 1}</td>
            <td><input class="smart-review-input smart-review-number" value="${esc(item.num)}" oninput="updatePendingSmartField(${index}, 'num', this.value, false)" onchange="updatePendingSmartField(${index}, 'num', this.value)" aria-label="Số cược"></td>
            <td>${(() => { const label = getDisplayTierBadge(item, region); return label ? `<div style="color:#fbbf24;font-size:10px;font-weight:bold;margin-bottom:2px;" title="${esc(label)}">🎯 ${esc(label)}</div>` : ''; })()}<select class="smart-review-select" onchange="updatePendingSmartField(${index}, 'betType', this.value)">${typeOptions(item, region)}</select></td>
            <td><div class="smart-review-money"><input class="smart-review-input" type="number" min="0" step="0.1" value="${Number(item.originalAmount) || 0}" oninput="updatePendingSmartField(${index}, 'originalAmount', this.value, false)" onchange="updatePendingSmartField(${index}, 'originalAmount', this.value)"> <span>k</span></div></td>
            <td class="smart-review-station-cell"><span class="smart-review-station-label">${esc(stationLabel)}</span><select class="smart-review-stations" multiple size="1" onchange="updatePendingSmartStation(${index}, this)" title="Chọn nhiều đài nếu cần">${stationOptions}</select></td>
            <td class="smart-review-lots">${financials.soLo}</td><td class="smart-review-cost">${financials.totalItemCost.toLocaleString()} ₫</td>
            <td><button class="btn btn-red smart-review-delete" onclick="removePendingSmartItem(${index})" aria-label="Xóa dòng">Xóa</button></td>
        </tr>`;
        }).join('');
        const groupTotal = group.reduce((sum, entry) => sum + calculateItemFinancials(entry.item, entry.item.region || 'MT').totalItemCost, 0);
        return `<tr class="smart-review-group"><td colspan="8"><span class="smart-review-group-id">${groupLabel}</span><span class="smart-review-group-numbers">${esc(groupNumbers)}</span><span class="smart-review-group-total">${group.length} dòng · ${groupTotal.toLocaleString()} ₫</span></td></tr>${groupRows}`;
    }).join('');
    const stationWarning = window._pendingStationWarning
        ? `<div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.4);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:#fbbf24;">${window._pendingStationWarning}</div>`
        : '';
    // Cảnh báo "G{giải}lo{số} không tồn tại" (xem parseSmartLottoText) hiện
    // NGAY TRONG khung xem lại — cố định, không tự tắt như toast, kèm 2 nút
    // hành động rõ ràng để người dùng quyết định luôn tại đây, khỏi phải tự
    // dò tìm dòng sai trong bảng để xóa tay.
    const gLoWarningList = window._pendingGLoWarning || [];
    const gLoWarning = gLoWarningList.length
        ? `<div style="background:rgba(248,113,113,0.14); border:1px solid rgba(248,113,113,0.45); border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12.5px; color:#fca5a5;"><div style="margin-bottom:8px;">⚠️ ${gLoWarningList.join('<br>⚠️ ')}</div><div style="display:flex; gap:8px;"><button type="button" class="btn btn-red" style="padding:4px 10px; font-size:12px;" onclick="removeInvalidGLoItems()">Bỏ Dòng Này</button><button type="button" class="btn" style="padding:4px 10px; font-size:12px; background:#334155; color:#e2e8f0;" onclick="dismissGLoWarning()">Vẫn Thêm</button></div></div>`
        : '';

    modalBody.innerHTML = stationWarning + gLoWarning + `<div class="smart-review-intro"><div><strong>Kiểm tra từng cụm số</strong><span>${groups.size} cụm liên kết · ${items.length} dòng</span></div><small>Giá, loại và đài có thể sửa trước khi nhập</small></div>
        <div class="smart-review-scroll"><table class="smart-review-table"><thead><tr><th>#</th><th>Số</th><th>Loại</th><th>Giá</th><th>Đài</th><th>Lô</th><th>Vốn</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="smart-review-empty">Chưa còn dòng nào.</td></tr>'}</tbody></table></div>
        <div class="smart-review-total"><span>Tổng vốn lượt này</span><b>${total.toLocaleString()} ₫</b></div>`;
}

function showSmartPreview(items) {
    window._pendingSmartItems = items;
    showModal({
        title: 'Xem lại & chỉnh trước khi nhập', body: '', confirmText: 'Xác nhận nhập', cancelText: 'Hủy', showCancel: true, confirmClass: 'btn-green',
        onConfirm: () => { const pending = window._pendingSmartItems || []; window._pendingSmartItems = null; window._pendingStationWarning = ''; window._pendingGLoWarning = []; window._pendingGLoInvalidTypes = []; if (pending.length) commitSmartItems(pending); resetModalSize(); },
        onCancel: () => { window._pendingSmartItems = null; window._pendingStationWarning = ''; window._pendingGLoWarning = []; window._pendingGLoInvalidTypes = []; resetModalSize(); }
    });
    renderSmartPreviewContent();
    setTimeout(() => { const card = document.querySelector('#custom-modal-overlay .modal-card'); if (card) { card.id = 'smart-preview-modal-card'; card.style.maxWidth = '1100px'; card.style.width = '96%'; } }, 0);
}

// "Bỏ Dòng Này" trong banner cảnh báo "G{giải}lo{số} không tồn tại" — xóa
// ĐÚNG các dòng đang bị sai giải/miền (khớp betType) khỏi danh sách đang xem
// lại, không đụng tới các dòng khác. "Vẫn Thêm" chỉ tắt banner, giữ nguyên
// dữ liệu (dùng khi người dùng xác nhận mình CỐ Ý muốn vậy, VD nhầm đài lúc
// gõ nhưng con số vẫn đúng ý, hoặc để sửa tay lại loại cược sau).
function removeInvalidGLoItems() {
    const invalidTypes = window._pendingGLoInvalidTypes || [];
    if (invalidTypes.length && Array.isArray(window._pendingSmartItems)) {
        const before = window._pendingSmartItems.length;
        window._pendingSmartItems = window._pendingSmartItems.filter(item => !invalidTypes.includes(String(item.betType || '').toLowerCase()));
        const removed = before - window._pendingSmartItems.length;
        if (typeof showToast === 'function') showToast(`Đã bỏ ${removed} dòng không hợp lệ`, 'success');
    }
    window._pendingGLoWarning = [];
    window._pendingGLoInvalidTypes = [];
    renderSmartPreviewContent();
}

function dismissGLoWarning() {
    window._pendingGLoWarning = [];
    window._pendingGLoInvalidTypes = [];
    renderSmartPreviewContent();
}

function commitSmartItems(items) {
    if (!items || items.length === 0) return;

    const activeG = typeof activeGroup !== 'undefined' ? activeGroup : null;
    if (!activeG || !appData?.[activeG]) return;

    const gObj = appData[activeG];
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' - ' + now.toLocaleDateString('vi-VN');

    items.forEach(it => {
        if (!it.id) it.id = 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        if (!it.createdAt) it.createdAt = timeStr;
        if (!it.createdAtTimestamp) it.createdAtTimestamp = Date.now();
        it.matched = false;
        it.winAmount = 0;
        it.matchCount = 0;
    });

    if (!Array.isArray(gObj.inputHistory)) gObj.inputHistory = [];
    gObj.inputHistory.push({
        id: Date.now(),
        time: timeStr,
        region: items[0]?.region || 'MT',
        items: items
    });

    if (!Array.isArray(gObj.betList)) gObj.betList = [];
    gObj.betList.push(...items);

    const ta = document.getElementById('smart-input');
    if (ta) ta.value = '';

    if (typeof recalculateTotals === 'function') recalculateTotals(activeG);
    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

    // === THÊM DÒNG NÀY ===
    if (typeof calcCapitalShare === 'function') calcCapitalShare();

    if (typeof showToast === 'function') showToast(`Đã nhập ${items.length} số vào nhóm ${activeG}`, 'success');
}

function confirmPendingInputDirect(items) {
    pendingInputItems = items;
    confirmPendingInput();
}

function toggleSkipComparison() {
    skipComparisonModal = !skipComparisonModal;
    if (typeof showToast === 'function') {
        showToast(skipComparisonModal ? 'Đã TẮT bảng xem lại – nhập thẳng' : 'Đã BẬT bảng xem lại', 'info');
    }
}

function showInputHelp() {
    const sec = (icon, title, color, bodyHtml) => `
        <div style="margin-bottom:18px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="font-size:18px;">${icon}</span>
                <b style="color:${color}; font-size:14.5px;">${title}</b>
            </div>
            ${bodyHtml}
        </div>`;

    const shortcutRow = (key, desc) => `
        <tr>
            <td style="padding:7px 10px; border:1px solid #334155; white-space:nowrap;">
                <span style="background:#1e293b; border:1px solid #475569; border-radius:5px; padding:2px 8px; font-family:monospace; color:#00f3ff; font-weight:bold;">${key}</span>
            </td>
            <td style="padding:7px 10px; border:1px solid #334155;">${desc}</td>
        </tr>`;

    const typeRow = (name, note, examples, coverage) => `
        <tr>
            <td style="padding:8px; border:1px solid #334155; vertical-align:top; white-space:nowrap;">
                <b style="color:#fbbf24;">${name}</b>
                ${note ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">${note}</div>` : ''}
            </td>
            <td style="padding:8px; border:1px solid #334155;">${examples}</td>
            <td style="padding:8px; border:1px solid #334155; color:#a5f3fc;">${coverage}</td>
        </tr>`;

    const help = `
        <div style="max-height:72vh; overflow-y:auto; padding-right:8px; font-size:13px; color:#e2e8f0; line-height:1.55;">

            <div style="background:rgba(0,243,255,0.08); border:1px solid rgba(0,243,255,0.25); border-radius:8px; padding:10px 12px; margin-bottom:18px;">
                <b style="color:#00f3ff;">💡 Mẹo quan trọng nhất:</b>
                Khi 1 dòng dùng NHIỀU loại cược chung 1 bộ số (VD "00.33.44 bl 3. Chéo 0.5k. Db 20k"), luôn gõ kèm đơn vị <b>k</b>/<b>n</b> cho tiền — máy sẽ hiểu đúng "dùng lại số cũ", không bị nhầm số tiền thành số cược mới.
            </div>

            ${sec('⌨️', 'Phím Tắt Nhanh', '#00f3ff', `
                <table style="width:100%; border-collapse:collapse;">
                    <tbody>
                        ${shortcutRow('Shift + T', 'Mở modal <b>Nhập Tay Thông Minh</b> (từng dòng số + dropdown loại cược)')}
                        ${shortcutRow('Shift + B', 'Xử lý (phân tích) nội dung đang dán trong khung <b>Nhập Nhanh Thông Minh</b>')}
                        ${shortcutRow('Shift + F', 'Mở <b>Lọc / Cắt thông minh</b> — cắt bớt tiền hoặc lọc theo mức K trước khi đưa vào Bảng Chi Tiết')}
                        ${shortcutRow('Shift + G', 'Thêm dòng mới (trong modal Nhập Tay)')}
                        ${shortcutRow('Shift + D', 'Focus nhanh vào ô dán KQXS để dò số')}
                        ${shortcutRow('Shift + S', 'Dò kết quả ngay (giống bấm nút "Dò Số")')}
                        ${shortcutRow('Enter', 'Xác nhận/lưu khi đang mở modal Nhập Tay hoặc Nhập Nhanh')}
                    </tbody>
                </table>
            `)}

            ${sec('✍️', 'Nhập Tay Thông Minh (modal có dropdown chọn loại)', '#fbbf24', `
                <div style="background:rgba(0,243,255,0.08); border:1px solid rgba(0,243,255,0.25); border-radius:8px; padding:10px 12px; margin-bottom:12px;">
                    <b style="color:#00f3ff;">Chỉ có ĐÚNG 3 KIỂU CƯỢC</b> — khớp đúng 3 cột <b>2c / 3c / Đá</b> trong Bảng Chi Tiết: <b>2C</b> = số 2 chữ số, <b>3C</b> = số 3 chữ số, <b>Đá</b> = 1 cặp/nhóm số.
                    <p style="margin:8px 0 0;">Mọi tên gọi khác trong dropdown "Loại cược" (Bao Lô, Đặc Biệt, Giải riêng, 5 Cuối, 12 Đầu, 13 Đầu, Xỉu Chủ, Đầu, Đuôi...) <b style="color:#f87171;">KHÔNG PHẢI là kiểu cược thứ 4</b> — chỉ là chọn <b>DÒ Ở ĐÂU (giải nào)</b> cho đúng 1 trong 3 kiểu trên. Tự hỏi: Số gõ vào là 2C/3C/Đá? Nếu 2C hoặc 3C — dò Bao Lô (mọi giải) hay chỉ 1 giải cụ thể? Nếu Đá — Thẳng (2 số), Chéo/Xiên (3+ số cả nhóm) hay Vòng (3+ số tách cặp)?</p>
                </div>
                <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#0f172a; color:#00f3ff;">
                            <th style="padding:8px; border:1px solid #334155; text-align:left;">Loại cược</th>
                            <th style="padding:8px; border:1px solid #334155; text-align:left;">Gõ số như thế nào</th>
                            <th style="padding:8px; border:1px solid #334155; text-align:left;">Dò trúng ở đâu / bao nhiêu lô</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="3" style="padding:6px 8px; background:#1e293b; color:#fbbf24; font-weight:bold;">— KIỂU 2C (số 2 chữ số) —</td></tr>
                        ${typeRow('Bao Lô 2C', '2 chữ số — 2C của TẤT CẢ giải', '<code>68</code>', 'Dò TOÀN BỘ 9 giải (G1→G8+ĐB). MT/MN 18 lô, MB 27 lô.')}
                        ${typeRow('Giải riêng — dạng 2C (VD Đặc Biệt, G7, G8...)', '2 chữ số — 2C của ĐÚNG 1 giải', '<code>39</code> chọn Đặc Biệt', 'CHỈ tính trúng đúng 1 giải đã chọn, không tính giải khác — kể cả số trùng.')}
                        ${typeRow('13 Đầu — dạng 2C', '2 chữ số — 2C của tổ hợp G8+G7+G6+G5+G4', '<code>68</code>', 'MT/MN 13 lô, MB 17 lô (Bắc không có G8 nên gọi là 12 Đầu).')}
                        ${typeRow('6 Đầu — dạng 2C (chỉ Trung/Nam)', '2 chữ số — 2C của tổ hợp G8+G7+G6+G5', '<code>68</code>', 'Trung/Nam 6 lô. Gõ tắt <code>6dau</code>. Không có ở Miền Bắc.')}
                        ${typeRow('Đầu — dạng 2C', '2 chữ số — 2C của 1 giải theo miền (MB: G7, MT/MN: G8)', '<code>68</code>', 'Chỉ 1 giải, đã phân biệt theo miền, không dùng chung công thức.')}
                        ${typeRow('Đuôi — dạng 2C', '2 chữ số — 2C của Giải Đặc Biệt', '<code>96</code>', 'Chỉ dò đuôi số của Giải Đặc Biệt (mọi miền như nhau).')}
                        <tr><td colspan="3" style="padding:6px 8px; background:#1e293b; color:#fbbf24; font-weight:bold;">— KIỂU 3C (số 3 chữ số) —</td></tr>
                        ${typeRow('Bao Lô 3C', '3 chữ số — 3C của TẤT CẢ giải', '<code>839</code>', 'Dò TOÀN BỘ 9 giải. MT/MN 17 lô, MB 23 lô.')}
                        ${typeRow('Giải riêng — dạng 3C (VD Đặc Biệt, G1-G7...)', '3 chữ số — 3C của ĐÚNG 1 giải', '<code>339</code> chọn Đặc Biệt', 'CHỈ tính trúng đúng 1 giải đã chọn.')}
                        ${typeRow('12 Đầu — dạng 3C', '3 chữ số — 3C của tổ hợp G7+G6+G5+G4', '<code>839</code>', 'MT/MN 12 lô, MB 17 lô (không có G8 vì G8 chỉ 2 chữ số).')}
                        ${typeRow('5 Đầu — dạng 3C (chỉ Trung/Nam)', '3 chữ số — 3C của tổ hợp G7+G6+G5', '<code>839</code>', 'Trung/Nam 5 lô. Gõ tắt <code>5dau</code>. Không có ở Miền Bắc.')}
                        ${typeRow('5 Cuối / 4 Cuối (Trung-Nam gọi "5 Cuối", Bắc gọi "4 Cuối")', 'Gõ <code>5c</code>/<code>4c</code> đều nhận — 2 hoặc 3 chữ số', '<code>339</code>', 'Trung/Nam = G3+G2+G1+ĐB (5 lô). Bắc = G2+G1+ĐB (4 lô, KHÔNG có Giải 3). Tự đổi tên hiển thị đúng theo miền.')}
                        ${typeRow('12 Cuối (chỉ Trung/Nam — KHÁC "12 Đầu")', '2 hoặc 3 chữ số', '<code>839</code>', 'Trung/Nam = G4+G3+G2+G1+ĐB = 12 lô. Gõ tắt <code>12cuoi</code> — khác hẳn "12 Đầu" (G7+G6+G5+G4) dù trùng số lô.')}
                        ${typeRow('10 Cuối (chỉ Miền Bắc)', '2 hoặc 3 chữ số', '<code>839</code>', 'Bắc = ĐB+G1+G2+G3 = 10 lô. Gõ tắt <code>10c</code>/<code>10cuoi</code>.')}
                        ${typeRow('14 Cuối (chỉ Miền Bắc)', '2 hoặc 3 chữ số', '<code>839</code>', 'Bắc = ĐB+G1+G2+G3+G4 = 14 lô. Gõ tắt <code>14c</code>/<code>14cuoi</code>/<code>4 chót</code> (cách khách Bắc hay gõ).')}
                        ${typeRow('Xỉu Chủ — dạng 3C', '3 chữ số — 3C của Đầu+Đuôi gộp', '<code>339</code>', 'MT/MN = G7+ĐB (2 lô), MB = G6+ĐB (4 lô).')}
                        <tr><td colspan="3" style="padding:6px 8px; background:#1e293b; color:#fbbf24; font-weight:bold;">— KIỂU ĐÁ (cặp/nhóm số) —</td></tr>
                        ${typeRow('Đá Thẳng', 'Đúng 2 số', '<code>12 34</code>', 'TRÚNG khi CẢ 2 số cùng về (không cần cùng giải/cùng đài). MT/MN 36 lô, MB 54 lô.')}
                        ${typeRow('Đá Xiên', '3 số trở lên — <span style="color:#f87171;">CẢ NHÓM là 1 cược duy nhất</span>', '<code>15 51 11 xiên</code>', 'TRÚNG chỉ khi TẤT CẢ số trong nhóm đều về — thiếu 1 số là thua cả cụm. Vốn tăng theo SỐ CON trong nhóm (18/con MT-MN, 27/con Bắc) — VD 3 con Bắc = 3×27 = 81 lô, KHÔNG cố định 1 mức.')}
                        ${typeRow('Đá Chéo', '3 số trở lên — <span style="color:#4ade80;">tách thành từng cặp độc lập</span>', '<code>15 51 11 chéo</code> → 3 cặp: 15-51, 15-11, 51-11', 'Mỗi cặp tự ăn/thua riêng — ra đủ 2 con trúng 1 cặp, đủ cả 3 con trúng cả 3 cặp. Mỗi cặp tính 36/54 lô như đá thẳng (không cộng dồn theo cả nhóm). Từ 4, 5, 6 con trở lên vẫn là Đá Chéo, chỉ tách ra nhiều cặp hơn (VD 4 con = 6 cặp).')}
                        <tr><td colspan="3" style="padding:4px 8px; background:rgba(56,189,248,0.08); color:#7dd3fc; font-size:11px;">⚠️ "Chéo" và "Xiên" là 2 CÁCH TÍNH KHÁC NHAU — không phải 2 tên gọi của cùng 1 thứ. Chỉ đúng 2 số thì gõ "chéo" hay "xiên"/"xuyên" đều tự hiểu là Đá Thẳng; từ 3 số trở lên bắt buộc phải gõ rõ "chéo" hay "xiên"/"xuyên" để hệ thống biết đúng cách tính.</td></tr>
                        <tr><td colspan="3" style="padding:6px 8px; background:#1e293b; color:#fbbf24; font-weight:bold;">— CHỈ LÀ CÁCH BUNG SỐ, VẪN LÀ 2C/3C Ở TRÊN —</td></tr>
                        ${typeRow('Chẵn Chẵn / Lẻ Lẻ / Chẵn Lẻ / Lẻ Chẵn', '<span style="color:#f87171;">KHÔNG chọn dropdown</span> — gõ đúng cụm từ vào ô "Số", tự bung 25 số 2 chữ số', '<code>chan chan</code>, <code>le le</code>', 'Loại cược vẫn hiện "Bao Lô 2C" — mỗi số trong bộ 25 dò như 2C bao lô bình thường.')}
                        ${typeRow('12 Con Giáp (cả bộ 100 số)', '<span style="color:#f87171;">KHÔNG chọn dropdown</span> — gõ vào ô "Số", tự bung 100 số 2 chữ số', '<code>giap</code>, <code>12 con giap</code>', 'Loại cược vẫn hiện "Bao Lô 2C", ghi chú tự ghi "12 Con Giáp" để biết nguồn gốc.')}
                        ${typeRow('1 Con Giáp riêng lẻ (8-9 số)', '<span style="color:#f87171;">KHÔNG chọn dropdown</span> — gõ tên con giáp, tự bung 8-9 số 2 chữ số', '<code>ty</code>/<code>chuot</code>, <code>suu</code>/<code>trau</code>, <code>dan</code>/<code>ho</code>/<code>cop</code>, <code>mao</code>/<code>meo</code>, <code>thin</code>/<code>rong</code>, <code>ran</code>, <code>ngo</code>/<code>ngua</code>, <code>mui</code>/<code>de</code>, <code>than</code>/<code>khi</code>, <code>ga</code> (Dậu), <code>tuat</code>/<code>cho</code>, <code>hoi</code>/<code>heo</code>/<code>lon</code>', 'Loại cược vẫn hiện "Bao Lô 2C", ghi chú tự ghi tên con giáp (VD "Hợi (Heo)").')}
                        ${typeRow('"Đầu N" (0-9) trong ô Số', 'Gõ <code>dau3</code> / <code>dau 7</code> → tự bung 10 số 2 chữ số cùng hàng chục (VD đầu 3 = 30-39)', '<code>dau3</code>, <code>dau 10</code> (= đầu 1)', 'Chỉ là cách bung dàn số nhanh trong ô "Số", dò theo đúng loại cược bạn chọn (thường là Bao Lô 2C).')}
                        ${typeRow('Đảo (hoán vị chữ số)', 'Thêm chữ <code>dao</code> vào cuối ô "Số"', '<code>812 612 512 dao</code> → 18 số (mỗi số nở đủ hoán vị chữ số, vẫn 2C/3C tùy số gốc)', 'Mỗi số gõ vào được thay bằng TOÀN BỘ hoán vị chữ số của nó, dò theo đúng loại cược bạn chọn.')}
                    </tbody>
                </table>
                </div>
                <div style="margin-top:8px; padding:8px 10px; background:rgba(0,243,255,0.06); border:1px solid rgba(0,243,255,0.2); border-radius:6px; font-size:12px; color:#a5f3fc;">
                    ℹ️ Loại cược nào ứng với NHIỀU giải theo miền (VD "Đầu", "Đầu Đuôi", "Xỉu Chủ") thì dropdown tự đổi tên theo ĐÚNG miền bạn đang chọn (VD Miền Trung hiện "Đầu (Giải 8)", Miền Bắc hiện "Đầu (Giải 7)") — không cần nhớ quy tắc B/T/N.
                </div>
            `)}

            ${sec('⚡', 'Nhập Nhanh Thông Minh (dán nguyên văn tin nhắn khách)', '#00ff88', `
                <p style="color:#94a3b8; margin:0 0 8px;">Dán cả đoạn tin nhắn khách gửi vào khung lớn, bấm <b>Xử Lý</b> (hoặc Shift+B) — hệ thống tự tách từng dòng, từng loại cược. Những kiểu đã kiểm chứng hoạt động tốt:</p>
                <ul style="margin:0; padding-left:20px; color:#cbd5e1;">
                    <li style="margin-bottom:5px;"><b>Nhiều dòng / nhiều loại cược một lúc</b> — xuống dòng hoặc dấu <code>;</code> đều tách riêng được.</li>
                    <li style="margin-bottom:5px;"><b>Số đứng trước HOẶC sau từ khóa loại cược</b> — <code>68 da 91 =100k</code> hay <code>da 68 91 100k</code> đều nhận đúng.</li>
                    <li style="margin-bottom:5px;"><b>Danh sách số trơ trọi, KHÔNG ghi loại cược nào</b> — <code>22,34,54,54 5k</code> → tự hiểu từng số riêng lẻ, mặc định Bao Lô (2C nếu 2 chữ số, 3C nếu 3 chữ số), mỗi số 5k.</li>
                    <li style="margin-bottom:5px;"><b>Danh sách số cách nhau phẩy/chấm/gạch</b>, kể cả có khoảng trắng sau dấu phẩy — <code>986, 382, 68 đb 30k</code> nhận đủ cả 3 số, cùng dò Đặc Biệt.</li>
                    <li style="margin-bottom:5px;"><b>Nhiều loại cược dùng CHUNG 1 bộ số trên cùng dòng</b> — <code>00.33.44 bl 3k. Chéo 0.5k. Db 20k</code> — cả 3 loại tự dùng lại đúng 3 số 00,33,44 (nhớ luôn có đơn vị k/n cho tiền để hết mơ hồ).</li>
                    <li style="margin-bottom:5px;"><b>Đá Thẳng / Xiên / Chéo</b> — viết số cách nhau GẠCH NỐI hoặc KHOẢNG TRẮNG đều được: <code>20-30</code> hoặc <code>20 30 da</code> (đúng 2 số = Đá Thẳng, 2 số cùng về mới trúng). Từ 3 số trở lên, "xiên" và "chéo" là <b style="color:#f87171;">2 CÁCH TÍNH KHÁC NHAU</b>: <code>15 51 11 xien</code> = <b>Đá Xiên</b> — cả nhóm là 1 cược, THIẾU 1 số là thua hết, vốn = số con × 18/27; <code>15 51 11 cheo</code> = <b>Đá Chéo</b> — tách thành từng cặp riêng (C(n,2) cặp), mỗi cặp tự ăn/thua độc lập, từ 4-5-6 con trở lên vẫn vậy, chỉ tách nhiều cặp hơn. Chỉ đưa đúng 2 số thì "chéo/xiên" đều tự hiểu là Đá Thẳng.</li>
                    <li style="margin-bottom:5px;"><b>Kéo dãy số</b> — <code>20 đến 30 bl 5k</code> (bung đủ 11 số 20→30), <code>05..95 g1 5k</code>.</li>
                    <li style="margin-bottom:5px;"><b>Con giáp / chẵn lẻ</b> — <code>ty 10k</code>, <code>heo 10k</code>, <code>chan chan 10k</code>, <code>12 con giap 5k</code> (tự dò 12 con giáp riêng lẻ + tên gọi thường ngày như "heo", "chuot", "trau"...).</li>
                    <li style="margin-bottom:5px;"><b>Đảo (hoán vị chữ số)</b> — dùng được với BẤT KỲ loại cược nào, kể cả không ghi loại gì (mặc định Bao Lô): <code>20 30 đảo 5k</code> → 4 số (20,02,30,03) Bao Lô 5k; <code>812 612 512 đảo đb 100k</code> → 18 số dò Đặc Biệt 100k.</li>
                    <li style="margin-bottom:5px;"><b>Nối nhiều cụm dùng chung 1 số bằng dấu "+"</b> — <code>689 bl 20k + db 100k</code> = số 689 vừa đánh Bao Lô 20k vừa đánh Đặc Biệt 100k; <code>687 679 g7 + db 30k</code> tương tự cho nhiều số.</li>
                    <li style="margin-bottom:5px;"><b>"Giải N" gõ đủ chữ, có hoặc không dấu cách</b> — <code>giải7</code>, <code>giải 7</code>, <code>5 cuối</code>/<code>4 cuối</code>/<code>4 chót</code> (tự đổi đúng "5 Cuối" hay "4 Cuối" theo miền), <code>12 cuối</code>, <code>14 cuối</code>, <code>5 đầu</code>, <code>6 đầu</code>, <code>đầu chót</code> (= Đầu Đuôi) đều nhận đúng như gõ tắt (<code>g7</code>, <code>5c</code>/<code>4c</code>, <code>12cuoi</code>, <code>14cuoi</code>, <code>5dau</code>, <code>6dau</code>, <code>dd</code>).</li>
                    <li style="margin-bottom:5px;"><b>Giới hạn chỉ dò 1 (hay nhiều) giải cụ thể cho con giáp/chẵn lẻ</b> — gõ tên giải TRƯỚC hoặc SAU cụm con giáp/chẵn lẻ đều được: <code>Db. Heo x 50k</code> hoặc <code>Heo Db 50k</code> (chỉ dò Hợi ở Đặc Biệt); <code>G6 G7 G8 Heo 30k</code> (dò cả 3 giải, khớp 1 trong 3 là đủ trúng). Bảng Chi Tiết sẽ hiện thêm dòng "🎯 ..." cho biết đúng giải đang giới hạn.</li>
                    <li style="margin-bottom:5px;"><b>Giới hạn giải cho Đá/Chéo/Xiên/Vòng</b> — gõ tên giải TRƯỚC (đứng riêng, cách dấu chấm/xuống dòng) rồi mới tới số + từ khóa đá: <code>G4. 12 34 56 chéo x10k</code> → chỉ dò 3 số này trong Giải 4 (thay vì bao lô mọi giải như mặc định).</li>
                    <li style="margin-bottom:5px;"><b>Gắn tiền linh hoạt</b> — <code>k</code>, <code>n</code>, số thập phân, phân số (<code>0/5</code> = 0.5k), số ≥1000 tự hiểu là tiền mặt, dấu "=" trước tiền nghĩa là TỔNG CUỐI CÙNG (VD <code>303 bl =10k</code> = tổng 10k chia đều các lô, không phải 10k mỗi lô).</li>
                </ul>
                <div style="margin-top:10px; padding:8px 10px; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.25); border-radius:6px; font-size:12px; color:#fde68a;">
                    Sau khi xử lý, luôn hiện <b>bảng xem lại</b> để kiểm tra trước khi lưu — bấm <b>Lọc & Tách Số</b> (Shift+F) nếu cần cắt bớt vốn/lọc theo mức tiền trước khi đưa vào Bảng Chi Tiết.
                </div>
            `)}

            ${sec('📋', 'Bảng Chi Tiết — Màu Theo Miền', '#38bdf8', `
                <p style="color:#94a3b8; margin:0 0 6px;">Mỗi lượt nhập ("📩 Lượt nhập #...") có màu thanh ngang riêng theo MIỀN của tin đó — 1 nhóm trong 1 ngày thường có rất nhiều tin xen kẽ đủ 3 miền, nhìn màu phân biệt nhanh hơn hẳn đọc chữ cột "Đài" từng dòng:</p>
                <ul style="margin:0; padding-left:20px; color:#cbd5e1;">
                    <li style="margin-bottom:5px;"><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:#f59e0b; margin-right:6px; vertical-align:middle;"></span><b style="color:#f59e0b;">Cam</b> = Miền Nam</li>
                    <li style="margin-bottom:5px;"><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:#00f3ff; margin-right:6px; vertical-align:middle;"></span><b style="color:#00f3ff;">Xanh cyan</b> = Miền Trung</li>
                    <li style="margin-bottom:5px;"><span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:#c084fc; margin-right:6px; vertical-align:middle;"></span><b style="color:#c084fc;">Tím</b> = Miền Bắc</li>
                    <li style="margin-bottom:5px;">Màu lấy theo miền của SỐ trong lượt nhập đó (không phụ thuộc đài cụ thể là đài nào trong miền) — file "📊 Xuất File" cũng giữ đúng màu này khi in ra.</li>
                </ul>
            `)}

            ${sec('📊', 'Xuất File', '#a78bfa', `
                <p style="color:#94a3b8; margin:0 0 6px;">Nút <b>"📊 Xuất File nhóm này"</b> xuất báo cáo HTML riêng cho <b>nhóm đang chọn</b> (mỗi nhóm xuất riêng, không gộp chung).</p>
                <ul style="margin:0; padding-left:20px; color:#cbd5e1;">
                    <li style="margin-bottom:5px;">File xuất <b>tôn trọng đúng bộ lọc</b> đang bật trên Bảng Chi Tiết — nếu bạn đang lọc "🎯 Chỉ trúng" thì file cũng CHỈ chứa số trúng (tương tự "Chỉ trật" / lọc theo miền-đài / ô tìm kiếm).</li>
                    <li style="margin-bottom:5px;">Tổng vốn/tổng trúng trong file tính lại đúng theo đúng phần đã xuất, không lấy tổng cả nhóm khi đang lọc.</li>
                    <li style="margin-bottom:5px;">Tiêu đề báo cáo ghi rõ đang lọc gì, để dễ đối chiếu khi in ra.</li>
                    <li style="margin-bottom:5px;">Cột "Thành tiền" trong file luôn theo góc nhìn <b>nhà cái</b>: dương (+) = nhà cái lãi (xanh), âm (-) = nhà cái lỗ vì khách trúng vượt vốn (đỏ).</li>
                </ul>
            `)}
        </div>
    `;

    if (typeof showModal === 'function') {
        showModal({
            title: "📖 Hướng Dẫn Sử Dụng Chi Tiết",
            body: help,
            confirmText: "Đã hiểu",
            showCancel: false,
            wide: true
        });
    }
}

function deleteBetItem(index) {
    const activeG = typeof activeGroup !== 'undefined' ? activeGroup : null;
    if (!activeG || !appData?.[activeG]) return;

    const gObj = appData[activeG];
    if (!Array.isArray(gObj.betList) || !gObj.betList[index]) return;

    gObj.betList.splice(index, 1);

    if (typeof recalculateTotals === 'function') recalculateTotals(activeG);
    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    if (typeof showToast === 'function') showToast('Đã xóa số', 'success');
}

// BẢNG CHI TIẾT NÂNG CẤP: CỘT THÀNH TIỀN, ĐÀI/MIỀN TẠI CHECKBOX & TỔNG CỘNG CHÂN BẢNG
function renderMatrixTable() {
    const tbody = document.getElementById('excel-matrix-body');
    if (!tbody) return;

    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory || gObj.inputHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#64748b;padding:30px;">Chưa có dữ liệu nhập</td></tr>`;
        if (typeof updateGrandSummary === 'function') updateGrandSummary();
        // === THÊM DÒNG NÀY ===
        if (typeof calcCapitalShare === 'function') calcCapitalShare();
        return;
    }

    let grandTotalBet = 0;
    let grandTotalWin = 0;
    let htmlBuffer = [];

    // Lặp qua từng lượt nhập (Session)
    const historyLen = gObj.inputHistory.length;
    for (let sIdx = historyLen - 1; sIdx >= 0; sIdx--) {
        const session = gObj.inputHistory[sIdx];
        const betItemsById = new Map((gObj.betList || []).map(item => [item.id, item]));
        const items = (session.items || []).map(item => betItemsById.get(item.id) || item);
        if (items.length === 0) continue;

        let sessionTotalBet = 0;
        let sessionTotalWin = 0;

        // Tính toán trước cho session
        const itemRowsHtml = items.map((item, itemIdx) => {
            const prizes = BET_TYPES[item.betType]?.prizes || 18;
            const stationCount = (item.stations && item.stations.length > 0) ? item.stations.length : 1;
           
            // CÔNG THỨC CHUẨN: (Số k) * 1000 * số giải * số đài
            const totalItemCost = (item.originalAmount || 0) * 1000 * prizes * stationCount;
            const winVal = item.winAmount || 0;
            const netVal = winVal - totalItemCost;

            sessionTotalBet += totalItemCost;
            sessionTotalWin += winVal;

            const isHit = item.matched;
            const numStyle = isHit ? 'color:#ff4d4d; font-weight:bold; font-size:15px;' : 'color:#00f3ff; font-size:14px;';
           
            const itemBetType = BET_TYPES[item.betType] ? item.betType : mapBetType(item.betType);
            const typeSelectOptions = Object.entries(BET_TYPES).map(([val, info]) =>
                `<option value="${val}" ${itemBetType === val ? 'selected' : ''}>${info.name}</option>`
            ).join('');

            const netDisplay = winVal > 0
                ? `<span style="color:${netVal >= 0 ? '#00ff88' : '#ff4d4d'}; font-weight:bold;">${netVal >= 0 ? '+' : ''}${netVal.toLocaleString()} ₫</span>`
                : `<span style="color:#ff6b6b; font-weight:bold;">-${totalItemCost.toLocaleString()} ₫</span>`;

            return `
                <tr style="background:#0f172a;">
                    <td style="text-align:center; color:#64748b; font-size:11px;">${itemIdx + 1}</td>
                    <td style="text-align:center;">
                        <input type="checkbox" class="row-checkbox" data-session="${sIdx}" data-item="${itemIdx}">
                        <span style="display:block; font-size:9px; color:#a855f7; font-weight:bold; margin-top:2px;">${item.region || 'MT'}</span>
                    </td>
                    <td style="text-align:center; ${numStyle}">${item.num}</td>
                    <td style="text-align:center; font-size:12px;">${item.digits === 2 ? '✓' : ''}</td>
                    <td style="text-align:center; font-size:12px;">${item.digits === 3 ? '✓' : ''}</td>
                    <td style="text-align:center; font-size:12px;">${['da','dx','dv'].includes(item.betType) ? '✓' : ''}</td>
                    <td style="text-align:center; font-size:12px;">
                        <select style="background:#1e293b; color:#f472b6; border:1px solid #334155; border-radius:4px; padding:2px; cursor:pointer;"
                                onchange="changeItemBetType(${sIdx}, ${itemIdx}, this.value)">
                            ${typeSelectOptions}
                        </select>
                    </td>
                    <td style="text-align:center; font-size:13px; color:#38bdf8;">${item.originalAmount}k</td>
                    <td style="text-align:center; font-size:13px; color:#fbbf24; font-weight:bold;">${totalItemCost.toLocaleString()} ₫</td>
                    <td style="text-align:center; font-size:12px; color:${winVal > 0 ? '#ff4d4d' : '#64748b'}; font-weight:${winVal > 0 ? 'bold' : 'normal'};">
                        ${winVal > 0 ? winVal.toLocaleString() + ' ₫' : '—'}
                    </td>
                    <td style="text-align:center; font-size:12px;">${netDisplay}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-sm btn-gray" style="padding:1px 6px; font-size:10px;" onclick="deleteItemFromSession(${sIdx}, ${itemIdx})">✕</button>
                    </td>
                </tr>`;
        }).join('');

        grandTotalBet += sessionTotalBet;
        grandTotalWin += sessionTotalWin;

        const sessionNet = sessionTotalWin - sessionTotalBet;
        const stationsStr = items[0].stations?.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join(', ') || 'Chưa chọn';

        // Header của từng lượt tin nhắn
        const headerHtml = `
            <tr style="background:#1e293b; border-top:2px solid #00f3ff;">
                <td colspan="3" style="padding:8px 12px; font-weight:bold; color:#00f3ff;">
                    📩 Lượt nhập #${sIdx + 1} <span style="color:#94a3b8; font-size:11px; margin-left:4px;">(${session.time})</span>
                </td>
                <td colspan="3" style="padding:8px; color:#fbbf24; font-size:12px;">
                    Đài: <b>${stationsStr}</b> (${items[0].stations?.length || 1} đài)
                </td>
                <td colspan="3" style="padding:8px; color:#38bdf8; text-align:right; font-size:12px;">
                    Vốn tin này: <b>${sessionTotalBet.toLocaleString()} ₫</b>
                </td>
                <td colspan="2" style="padding:8px; text-align:right; font-size:12px; color:${sessionNet >= 0 ? '#00ff88' : '#ff6b6b'}; font-weight:bold;">
                    Thành tiền: ${sessionNet >= 0 ? '+' : ''}${sessionNet.toLocaleString()} ₫
                </td>
                <td style="text-align:center; padding:4px;">
                    <button class="btn btn-sm btn-red" style="padding:2px 8px; font-size:11px;" onclick="deleteSession(${sIdx})">Xóa Tin</button>
                </td>
            </tr>`;

        htmlBuffer.push(headerHtml + itemRowsHtml);
    }

    // Dòng TỔNG CỘNG TOÀN NHÓM ở chân bảng
    const grandNet = grandTotalWin - grandTotalBet;
    const footerHtml = `
        <tr style="background:#090d16; border-top:3px double #00f3ff; border-bottom:2px solid #00f3ff;">
            <td colspan="8" style="padding:10px; text-align:right; font-weight:bold; color:#00f3ff; font-size:13px;">
                🏆 TỔNG CỘNG TOÀN NHÓM:
            </td>
            <td style="text-align:center; padding:10px; color:#fbbf24; font-weight:bold; font-size:13px;">
                ${grandTotalBet.toLocaleString()} ₫
            </td>
            <td style="text-align:center; padding:10px; color:#ff4d4d; font-weight:bold; font-size:13px;">
                ${grandTotalWin > 0 ? grandTotalWin.toLocaleString() + ' ₫' : '—'}
            </td>
            <td style="text-align:center; padding:10px; font-weight:bold; font-size:13px; color:${grandNet >= 0 ? '#00ff88' : '#ff6b6b'};">
                ${grandNet >= 0 ? '+' : ''}${grandNet.toLocaleString()} ₫
            </td>
            <td></td>
        </tr>`;

    htmlBuffer.push(footerHtml);

    // Cập nhật DOM 1 lần duy nhất -> Siêu mượt, không lag
    tbody.innerHTML = htmlBuffer.join('');

    if (typeof updateGrandSummary === 'function') updateGrandSummary();

    // === THÊM DÒNG NÀY (cuối hàm) ===
    if (typeof calcCapitalShare === 'function') calcCapitalShare();
}

function renderDetailPagination(totalPages, totalItems) {
    const box = document.getElementById('detail-pagination');
    if (!box) return;

    if (totalPages <= 1) {
        box.innerHTML = `<div style="text-align:center;font-size:12px;color:#94a3b8;padding:6px 0;">Tổng <b style="color:#00f3ff">${totalItems}</b> số</div>`;
        return;
    }

    box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 0;flex-wrap:wrap;">
            <button class="btn btn-sm btn-gray" style="min-width:80px;" onclick="changeDetailPage(-1)" ${detailPage <= 1 ? 'disabled' : ''}>← Trước</button>
            <div style="background:#0f172a;border:1px solid #334155;border-radius:20px;padding:4px 14px;font-size:13px;">
                Trang <b style="color:#00f3ff">${detailPage}</b> / ${totalPages}
                <span style="color:#64748b;margin-left:6px;">(${totalItems} số)</span>
            </div>
            <button class="btn btn-sm btn-gray" style="min-width:80px;" onclick="changeDetailPage(1)" ${detailPage >= totalPages ? 'disabled' : ''}>Sau →</button>
        </div>
    `;
}

function changeDetailPage(delta) {
    detailPage += delta;
    renderMatrixTable();
}

function getTableItem(sessionIdx, itemIdx) {
    return appData[activeGroup]?.inputHistory?.[sessionIdx]?.items?.[itemIdx];
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

// Gõ vào ô tìm kiếm bắn sự kiện MỖI PHÍM GÕ — trước đây render lại TOÀN BỘ
// bảng ngay lập tức mỗi lần đó, với nhóm nhiều dòng thì gõ 1 từ dài là kích
// hoạt cả chục lần render liên tiếp trong tích tắc, cảm giác nặng/giật dù
// mỗi lần render tự nó không quá chậm. Dồn lại (debounce) — chỉ thật sự lọc
// + render sau khi ngừng gõ 220ms, gõ liên tục không kích hoạt render nào.
let detailSearchDebounceTimer = null;
function filterDetailTable(value) {
    const raw = String(value || '');
    clearTimeout(detailSearchDebounceTimer);
    detailSearchDebounceTimer = setTimeout(() => {
        detailSearchTerm = raw.trim().toLocaleLowerCase('vi-VN');
        currentMatrixPage = 1;
        renderMatrixTable(1);
    }, 220);
}

// Bấm "×" phải đưa TOÀN BỘ bộ lọc về mặc định — trước đây chỉ xóa chữ trong
// ô tìm kiếm, còn "Chỉ trúng/trật" và cây Miền/Đài đã tick vẫn dính nguyên,
// nhìn như bấm "×" không có tác dụng gì.
function clearDetailSearch() {
    const input = document.getElementById('detail-search-input');
    if (input) input.value = '';
    clearTimeout(detailSearchDebounceTimer);
    detailSearchTerm = '';
    detailMatchFilter = 'all';
    detailRegionFilter.clear();
    detailStationFilterSet.clear();
    currentMatrixPage = 1;
    renderMatrixTable(1);
}

// Lọc thông minh cho nhà cái đối chiếu: chỉ số trúng / chỉ số trật / tất cả.
// Kết hợp được với ô tìm kiếm — ví dụ gõ "79" + chọn "Chỉ số trúng" để xem
// riêng những dòng số 79 đã trúng.
function setDetailMatchFilter(value) {
    detailMatchFilter = (value === 'matched' || value === 'unmatched') ? value : 'all';
    currentMatrixPage = 1;
    updateDetailFilterButtonLabel();
    renderMatrixTable(1);
}

function hasActiveDetailFilter() {
    return Boolean(detailSearchTerm) || detailMatchFilter !== 'all' || detailRegionFilter.size > 0;
}

function toggleDetailFilterPanel() {
    const panel = document.getElementById('detail-filter-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Đóng panel khi bấm ra ngoài — gắn 1 lần duy nhất khi file load.
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('detail-filter-dropdown');
        const panel = document.getElementById('detail-filter-panel');
        if (!wrap || !panel || panel.style.display === 'none') return;
        if (!wrap.contains(e.target)) panel.style.display = 'none';
    });
}

// Tick 1 MIỀN (không tick đài con nào bên trong) = xem GỘP toàn bộ đài của
// miền đó. Bỏ tick miền → xóa luôn mọi đài con đã tick thuộc miền đó (không
// để sót lựa chọn con "mồ côi" không còn miền cha nào giữ nó).
function toggleDetailRegionFilter(region, checked) {
    if (checked) detailRegionFilter.add(region);
    else {
        detailRegionFilter.delete(region);
        [...detailStationFilterSet].forEach(s => {
            if (detailFilterStationRegionMap[s] === region) detailStationFilterSet.delete(s);
        });
    }
    currentMatrixPage = 1;
    populateDetailFilterPanel();
    updateDetailFilterButtonLabel();
    renderMatrixTable(1);
}

// Tick 1 ĐÀI CON cụ thể → tự tick luôn miền cha (chọn đài mà miền cha chưa
// tick thì vô nghĩa). Bỏ tick đài con → chỉ bỏ đúng đài đó, GIỮ miền cha
// (vẫn còn đài con khác hoặc quay lại xem gộp cả miền nếu bỏ hết đài con).
function toggleDetailStationFilter(region, station, checked) {
    if (checked) {
        detailStationFilterSet.add(station);
        detailRegionFilter.add(region);
    } else {
        detailStationFilterSet.delete(station);
    }
    currentMatrixPage = 1;
    populateDetailFilterPanel();
    updateDetailFilterButtonLabel();
    renderMatrixTable(1);
}

const REGION_ORDER_LIST = ['MN', 'MT', 'MB'];
const REGION_FULL_NAME = { MN: 'Miền Nam', MT: 'Miền Trung', MB: 'Miền Bắc' };
let detailFilterStationRegionMap = {}; // tên đài -> miền, dựng lại mỗi lần populate

// Tự liệt kê ĐÚNG các miền/đài THẬT SỰ có trong nhóm đang xem (không liệt kê
// miền/đài không hề có dữ liệu) — gọi lại mỗi lần render bảng để luôn khớp
// dữ liệu mới nhất (đổi nhóm, hoặc vừa thêm/xóa số làm mất hẳn 1 đài/miền).
function populateDetailFilterPanel() {
    const panel = document.getElementById('detail-filter-panel');
    if (!panel) return;
    const gObj = appData[activeGroup];
    const byRegion = {}; // { MN: Set(stations) }
    (gObj?.betList || []).forEach(item => {
        const region = item.region || 'MT';
        if (!byRegion[region]) byRegion[region] = new Set();
        (item.stations || []).forEach(s => byRegion[region].add(s));
    });

    detailFilterStationRegionMap = {};
    Object.entries(byRegion).forEach(([region, stationSet]) => {
        stationSet.forEach(s => { detailFilterStationRegionMap[s] = region; });
    });

    // Miền/đài đã biến mất khỏi dữ liệu (VD vừa xóa hết số) thì tự bỏ khỏi
    // lựa chọn đang lọc, tránh giữ lọc "ma" không còn ứng với gì.
    [...detailRegionFilter].forEach(r => { if (!byRegion[r]) detailRegionFilter.delete(r); });
    [...detailStationFilterSet].forEach(s => { if (!detailFilterStationRegionMap[s]) detailStationFilterSet.delete(s); });

    const matchRadios = ['all', 'matched', 'unmatched'].map(v => {
        const label = v === 'all' ? 'Tất cả' : v === 'matched' ? '🎯 Chỉ trúng' : 'Chỉ trật';
        return `<label style="display:flex; align-items:center; gap:6px; padding:3px 0; cursor:pointer; font-size:12.5px; color:#e2e8f0;">
            <input type="radio" style="margin:0;" name="detail-match-radio" value="${v}" ${detailMatchFilter === v ? 'checked' : ''} onchange="setDetailMatchFilter('${v}')"> ${label}
        </label>`;
    }).join('');

    // Thục lề bằng 1 khung con DUY NHẤT (margin-left + viền trái mảnh) thay
    // vì cộng padding riêng từng dòng — trước đây mỗi label tự cộng padding
    // khác nhau nên nhìn thục vào/thục ra không đều; giờ mọi checkbox (cả
    // miền lẫn đài con) đều margin:0, chỉ lệch đúng 1 mức duy nhất, nhìn như
    // cây phân cấp rõ ràng.
    const regionBlocks = REGION_ORDER_LIST.filter(r => byRegion[r] && byRegion[r].size).map(r => {
        const color = REGION_HEADER_COLOR[r] || REGION_HEADER_COLOR.MT;
        const stations = [...byRegion[r]].sort((a, b) => a.localeCompare(b, 'vi'));
        const stationRows = stations.map(s => `
            <label style="display:flex; align-items:center; gap:6px; padding:3px 0; cursor:pointer; font-size:12px; color:#cbd5e1;">
                <input type="checkbox" style="margin:0;" data-region="${r}" data-station="${escapeHtml(s)}" ${detailStationFilterSet.has(s) ? 'checked' : ''} onchange="toggleDetailStationFilter(this.dataset.region, this.dataset.station, this.checked)"> ${escapeHtml(s)}
            </label>`).join('');
        return `
        <div style="margin-bottom:4px;">
            <label style="display:flex; align-items:center; gap:6px; padding:3px 0; cursor:pointer; font-size:12.5px; font-weight:bold; color:${color};">
                <input type="checkbox" style="margin:0;" ${detailRegionFilter.has(r) ? 'checked' : ''} onchange="toggleDetailRegionFilter('${r}', this.checked)"> ${REGION_FULL_NAME[r]}
            </label>
            <div style="margin-left:9px; padding-left:12px; border-left:1px solid #334155;">${stationRows}</div>
        </div>`;
    }).join('');

    panel.innerHTML = `
        <div style="border-bottom:1px solid #334155; padding-bottom:6px; margin-bottom:6px;">${matchRadios}</div>
        <div style="font-size:10.5px; color:#64748b; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:4px;">Theo Miền / Đài</div>
        ${regionBlocks || '<div style="font-size:11.5px; color:#64748b;">Chưa có dữ liệu</div>'}
    `;
}

function updateDetailFilterButtonLabel() {
    const btn = document.getElementById('detail-filter-btn');
    if (!btn) return;
    const parts = [];
    if (detailMatchFilter === 'matched') parts.push('🎯 Trúng');
    else if (detailMatchFilter === 'unmatched') parts.push('Trật');
    if (detailRegionFilter.size) {
        const label = [...detailRegionFilter].map(r => {
            const stationsOfRegion = [...detailStationFilterSet].filter(s => detailFilterStationRegionMap[s] === r);
            return stationsOfRegion.length ? stationsOfRegion.join('+') : REGION_FULL_NAME[r];
        }).join(', ');
        parts.push(label);
    }
    btn.textContent = (parts.length ? parts.join(' · ') : 'Tất cả') + ' ▾';
}

function detailItemMatches(item, session) {
    if (detailMatchFilter === 'matched' && !item.matched) return false;
    if (detailMatchFilter === 'unmatched' && item.matched) return false;
    if (detailRegionFilter.size > 0) {
        const itemRegion = item.region || 'MT';
        if (!detailRegionFilter.has(itemRegion)) return false;
        const checkedStationsForRegion = [...detailStationFilterSet].filter(s => detailFilterStationRegionMap[s] === itemRegion);
        if (checkedStationsForRegion.length && !(Array.isArray(item.stations) && item.stations.some(s => checkedStationsForRegion.includes(s)))) {
            return false;
        }
    }
    if (!detailSearchTerm) return true;
    // Một chuỗi chỉ gồm 2–3 chữ số được hiểu là tìm chính xác con số,
    // tránh việc "21" vô tình khớp với ngày 21 hoặc giờ 21:xx.
    if (/^\d{2,3}$/.test(detailSearchTerm)) {
        return String(item.num || '') === detailSearchTerm;
    }
    const stationText = Array.isArray(item.stations) ? item.stations.join(' ') : '';
    const searchable = [
        item.num, item.region, stationText, item.note, item.createdAt,
        session?.time, session?.region, BET_TYPES[item.betType]?.name
    ].filter(Boolean).join(' ').toLocaleLowerCase('vi-VN');
    return searchable.includes(detailSearchTerm);
}

function updateDetailItemField(sessionIdx, itemIdx, field, value) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;

    if (field === 'price') {
        const price = Math.max(0, parseFloat(value) || 0);
        item.originalAmount = price;
        item.amount = price * 1000;
    } else if (field === 'note') {
        item.note = String(value || '').trim();
    }
    item.edited = true;

    const mainItem = appData[activeGroup]?.betList?.find(bet => bet.id === item.id);
    if (mainItem) Object.assign(mainItem, item);
    recalculateTotals(activeGroup);
    saveAppDataToDB();
    renderMatrixTable(currentMatrixPage, sessionIdx);
    showToast(field === 'price' ? 'Đã cập nhật giá tiền' : 'Đã cập nhật ghi chú', 'success');
}

// Cột Số phải là ô nhập thực sự, không chỉ là ô tìm kiếm. Khi đang gõ chỉ
// cập nhật dữ liệu và hẹn lưu để giao diện không lag; khi rời ô sẽ lưu ngay.
function updateDetailItemNumber(sessionIdx, itemIdx, value, commit = false) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;
    const raw = String(value || '').replace(/\D/g, '').slice(0, 3);
    if (!raw) return;
    item.num = raw.padStart(raw.length >= 3 ? 3 : 2, '0');
    item.digits = item.num.length;
    item.edited = true;
    const mainItem = appData[activeGroup]?.betList?.find(bet => bet.id === item.id);
    if (mainItem) Object.assign(mainItem, item);
    if (commit) {
        recalculateTotals(activeGroup);
        saveAppDataToDB();
        renderMatrixTable(currentMatrixPage, sessionIdx);
        showToast('Đã cập nhật số', 'success');
    } else {
        saveAppDataToDBDebounced();
    }
}

function updateDetailItemFieldLive(sessionIdx, itemIdx, field, value) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;
    if (field === 'price') {
        const price = Math.max(0, parseFloat(value) || 0);
        item.originalAmount = price;
        item.amount = price * 1000;
    } else if (field === 'note') {
        item.note = String(value || '');
    }
    item.edited = true;
    const mainItem = appData[activeGroup]?.betList?.find(bet => bet.id === item.id);
    if (mainItem) Object.assign(mainItem, item);
    saveAppDataToDBDebounced();
}

function updateLiveClock() {
    const clock = document.getElementById('live-clock');
    if (!clock) return;
    const now = new Date();
    clock.textContent = `${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${now.toLocaleDateString('vi-VN')}`;
}

setInterval(updateLiveClock, 1000);
document.addEventListener('DOMContentLoaded', updateLiveClock);

function updateBetField(sessionIdx, itemIdx, field, value) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;
    if (field === 'amount') item.amount = Math.max(0, parseFloat(value) || 0);
    if (field === 'stationText') item.stations = value.split(/[,;]+/).map(v => v.trim()).filter(Boolean);
    item.originalAmount = item.originalAmount || item.amount;
    syncBetList();
    recalculateTotals(activeGroup);
    saveAppDataToDB();
    updateDetailTotals();
    updateGrandSummary();
}

function handleTableNumberPaste(sessionIdx, itemIdx, value) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;
    const nums = value.match(/\d{1,4}/g) || [];
    if (!nums.length) return;
    item.num = nums[0].padStart(nums[0].length >= 3 ? nums[0].length : 2, '0');
    item.digits = item.num.length >= 3 ? 3 : 2;
    nums.slice(1).forEach(num => {
        const clone = JSON.parse(JSON.stringify(item));
        clone.num = num.padStart(num.length >= 3 ? num.length : 2, '0');
        clone.digits = clone.num.length >= 3 ? 3 : 2;
        clone.matched = false;
        clone.winAmount = 0;
        appData[activeGroup].inputHistory[sessionIdx].items.push(clone);
    });
    syncBetList();
    renderMatrixTable();
    saveAppDataToDB();
}

function setBetDigits(sessionIdx, itemIdx, digits, checked) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item || !checked) return;
    item.digits = digits;
    item.num = item.num.padStart(digits, '0').slice(-digits);
    syncBetList();
    renderMatrixTable();
    saveAppDataToDB();
}

function setBetType(sessionIdx, itemIdx, type) {
    const item = getTableItem(sessionIdx, itemIdx);
    if (!item) return;
    item.betType = type;
    syncBetList();
    saveAppDataToDB();
}

function syncBetList() {
    const gObj = appData[activeGroup];
    gObj.betList = gObj.inputHistory.flatMap(session => session.items.filter(item => item.amount > 0));
}

function addManualBetRow() {
    // Hiện popup
    const modal = document.getElementById('manual-input-modal');
    if (!modal) return showToast('Không tìm thấy popup', 'error');

    // Render danh sách đài đã chọn bên ngoài + đài hôm nay
    renderManualStations();
    
    // Reset form
    document.getElementById('manual-so').value = '';
    document.getElementById('manual-tien').value = '5';
    document.getElementById('manual-donvi').value = 'k';
    document.getElementById('manual-loai').value = 'bl';
    document.getElementById('manual-so-hint').textContent = '';
    document.getElementById('manual-preview').innerHTML = '';

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('manual-so').focus(), 100);
}

function closeManualModal() {
    document.getElementById('manual-input-modal').style.display = 'none';
}

function renderManualStations() {
    const container = document.getElementById('manual-station-list');
    if (!container) return;

    const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const todayStations = getTodayStations(region);

    // Ưu tiên đài đã tick bên ngoài, nếu chưa có thì lấy đài hôm nay
    let list = selectedStations.length > 0 ? [...selectedStations] : todayStations;

    if (list.length === 0) {
        container.innerHTML = '<span style="color:#f87171;font-size:13px;">Chưa chọn đài nào. Hãy chọn đài ở ngoài trước.</span>';
        return;
    }

    container.innerHTML = list.map(s => {
        const abbr = STATION_ABBR[s] || s.substring(0, 3);
        const checked = selectedStations.includes(s) || todayStations.includes(s) ? 'checked' : '';
        return `
            <label style="display:flex;align-items:center;gap:4px;background:#1e293b;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">
                <input type="checkbox" value="${s}" ${checked} class="manual-station-cb">
                ${abbr}
            </label>
        `;
    }).join('');
}

function confirmManualInput() {
    const soEl = document.getElementById('manual-so');
    const loaiEl = document.getElementById('manual-loai');
    const tienEl = document.getElementById('manual-tien');
    const donviEl = document.getElementById('manual-donvi');

    // Modal cũ không còn trong HTML → bỏ qua an toàn
    if (!soEl || !loaiEl || !tienEl) {
        return showToast('Dùng 「＋ Thêm dòng nhập thông minh」 (nhiều dòng / nhiều loại)', 'info');
    }

    const soRaw = soEl.value.trim();
    const tien = parseFloat(tienEl.value) || 0;
    const donvi = donviEl ? donviEl.value : 'k';

    if (!soRaw || tien <= 0) {
        return showToast('Vui lòng nhập Số và Tiền hợp lệ', 'error');
    }

    const nums = soRaw.match(/\d{2,4}/g) || [];
    if (nums.length === 0) return showToast('Không nhận được số hợp lệ', 'error');

    // Hỗ trợ 1 loại hoặc multi-select (nếu HTML còn multiple)
    let loaiList = [];
    if (loaiEl.multiple) {
        loaiList = Array.from(loaiEl.selectedOptions).map(o => o.value);
    } else if (loaiEl.value) {
        loaiList = [loaiEl.value];
    }
    if (loaiList.length === 0) {
        return showToast('Hãy chọn ít nhất 1 loại cược', 'error');
    }

    const checkedStations = Array.from(
        document.querySelectorAll('.manual-station-cb:checked')
    ).map(cb => cb.value);

    if (checkedStations.length === 0) {
        return showToast('Hãy chọn ít nhất 1 đài', 'error');
    }

    const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const heso = (donvi === 'k' || donvi === 'n') ? 1000 : 1;
    // Chỉ lưu giá gốc (k) — vốn do calculateItemFinancials tính
    const giaK = tien;

    const gObj = appData[activeGroup];
    if (!gObj.betList) gObj.betList = [];
    if (!gObj.inputHistory) gObj.inputHistory = [];

    const newItems = [];
    const now = Date.now();
    const enteredAt = new Date();
    const timeStr = enteredAt.toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' - ' + enteredAt.toLocaleDateString('vi-VN');

    nums.forEach(num => {
        const digits = num.length >= 3 ? 3 : 2;
        const padded = num.padStart(digits === 2 ? 2 : 3, '0');

        loaiList.forEach(loai => {
            const item = {
                num: padded,
                digits: (loai === '3c' || loai === '4c') ? 3 : digits,
                originalAmount: giaK,          // 5 = 5k
                amount: giaK * 1000,           // 5000 — KHÔNG nhân số lô / số đài
                region,
                betType: loai,
                note: '',
                prizeTag: '',
                matched: false,
                matchCount: 0,
                winAmount: 0,
                stations: [...checkedStations],
                prizeInfo: '',
                createdAt: timeStr,
                createdAtTimestamp: now,
                id: 'bet_' + now + '_' + Math.random().toString(36).slice(2, 7)
            };
            newItems.push(item);
            gObj.betList.push(item);
        });
    });

    // 1 lần nhập = 1 tin
    gObj.inputHistory.push({
        id: now,
        time: timeStr,
        region,
        items: newItems
    });

    if (typeof recalculateTotals === 'function') recalculateTotals(activeGroup);
    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof updateDetailTotals === 'function') updateDetailTotals();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    if (typeof closeManualModal === 'function') closeManualModal();

    showToast(`Đã thêm ${newItems.length} hàng (${nums.length} số × ${loaiList.length} loại)`, 'success');
}
// ================= TỔNG DƯỚI BẢNG CHI TIẾT =================
function updateDetailTotals() {
    const gObj = appData[activeGroup];
    const el = (id) => document.getElementById(id);

    if (!gObj) {
        if (el('detail-total-messages')) el('detail-total-messages').innerText = '0';
        if (el('detail-total-count')) el('detail-total-count').innerText = '0';
        if (el('detail-total-bet')) el('detail-total-bet').innerText = '0 ₫';
        if (el('detail-total-win')) el('detail-total-win').innerText = '0 ₫';
        if (el('detail-total-net')) el('detail-total-net').innerText = '0 ₫';
        if (el('detail-percent-amount')) el('detail-percent-amount').innerText = '0 ₫';
        return;
    }

    // Tính lại từ betList cho khớp với bảng
    recalculateTotals(activeGroup);

    const totalMessages = (gObj.inputHistory || []).length;
    const totalCount = (gObj.betList || []).length;
    const totalBet = gObj.totals.totalBet || 0;
    const totalWin = gObj.totals.totalWin || 0;

    // 1. Tính lợi nhuận Nhà Cái (Thành tiền) = Tổng cược - Tổng trúng
    // Nếu chưa trúng hoặc cược > trúng -> Kết quả DƯƠNG (+) = Nhà cái LỜI
    const houseNet = totalBet - totalWin;

    if (el('detail-total-messages')) el('detail-total-messages').innerText = totalMessages.toLocaleString();
    if (el('detail-total-count')) el('detail-total-count').innerText = totalCount.toLocaleString();
    if (el('detail-total-bet')) el('detail-total-bet').innerText = totalBet.toLocaleString() + ' ₫';
    if (el('detail-total-win')) el('detail-total-win').innerText = totalWin > 0 ? totalWin.toLocaleString() + ' ₫' : '—';

    // 2. Hiển thị Thành tiền gốc của nhà cái (Không bị trừ khi gõ %)
    if (el('detail-total-net')) {
        el('detail-total-net').innerText = (houseNet >= 0 ? '+' : '') + houseNet.toLocaleString() + ' ₫';
        el('detail-total-net').style.color = houseNet >= 0 ? '#00ff88' : '#ff6b6b';
    }

    // 3. Tính tiền hùn vốn để chia cho cổ đông (% dựa trên lợi nhuận/lỗ nhà cái)
    const percentVal = parseFloat(el('detail-percent')?.value || 0);
    const percentAmount = Math.round((houseNet * percentVal) / 100);

    if (el('detail-percent-amount')) {
        // Thêm dấu + / - để rõ ràng số tiền hùn vốn là lời hay lỗ
        const prefix = percentAmount > 0 ? '+' : '';
        el('detail-percent-amount').innerText = prefix + percentAmount.toLocaleString() + ' ₫';
    }
}
function deleteSession(sessionIdx) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory[sessionIdx]) return;
    if (!confirm(`Xóa toàn bộ lần nhập #${sessionIdx + 1}?`)) return;

    const removed = gObj.inputHistory.splice(sessionIdx, 1)[0];
    // Cũng xóa khỏi betList (đơn giản)
    removed.items.forEach(item => {
        const idx = gObj.betList.findIndex(b => b.num === item.num && b.amount === item.amount && b.region === item.region);
        if (idx > -1) gObj.betList.splice(idx, 1);
    });

    recalculateTotals(activeGroup);
    renderMatrixTable();
    updateGrandSummary();
    saveAppDataToDB();
    showToast('Đã xóa lần nhập', 'success');
}

function deleteItemFromSession(sessionIdx, itemIdx) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory[sessionIdx]) return;

    const item = gObj.inputHistory[sessionIdx].items[itemIdx];
    gObj.inputHistory[sessionIdx].items.splice(itemIdx, 1);

    // Xóa khỏi betList
    const idx = gObj.betList.findIndex(b => b.num === item.num && b.amount === item.amount && b.region === item.region);
    if (idx > -1) gObj.betList.splice(idx, 1);

    if (gObj.inputHistory[sessionIdx].items.length === 0) {
        gObj.inputHistory.splice(sessionIdx, 1);
    }

    recalculateTotals(activeGroup);
    renderMatrixTable();
    updateGrandSummary();
    saveAppDataToDB();
    showToast('Đã xóa số', 'success');
}

// ================= TÍNH LẠI TỔNG NHÓM =================
function recalculateTotals(g) {
    const groupName = g || activeGroup;
    const gObj = appData[groupName];
    if (!gObj) return;

    let totalBet = 0;
    let totalWin = 0;
    const list = gObj.betList || [];

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const fin = calculateItemFinancials(item, item.region || 'MT');
        totalBet += fin.totalItemCost; // đúng = giá_k × số_lô × số_đài × 1000

        // Chỉ cộng tiền trúng khi đã dò và trúng
        if (item.matched) {
            totalWin += (Number(item.winAmount) || fin.winAmount || 0);
        }
    }

    if (!gObj.totals) gObj.totals = {};
    gObj.totals.totalBet = totalBet;
    gObj.totals.totalWin = totalWin;
    gObj.totals.net = totalWin - totalBet;
    gObj.totals.mtXac = totalBet; // giữ tương thích chỗ cũ
    gObj.totals.mbXac = 0;
}

// ================= BẢNG TỔNG THỂ TOÀN BỘ NHÓM =================
function updateGrandSummary() {
    const tbody = document.getElementById('grand-summary-body');
    if (!tbody) return;

    let html = '';
    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const data = appData[g];

        if (!data) {
            html += `
                <tr style="cursor:pointer;" onclick="selectGroupAndScroll('${g}')">
                    <td><b>Nhóm ${g}</b></td>
                    <td>0</td><td>0</td><td>0</td>
                    <td><span style="color:#94a3b8;">0</span></td>
                    <td>⚪ Trống</td>
                </tr>`;
            continue;
        }

        if (typeof recalculateTotals === 'function') recalculateTotals(g);

        const t = data.totals || {};
        const betMT = Number(t.mtXac) || 0;          // Cược Miền Trung
        const betMBMN = Number(t.mbXac) || 0;        // Cược Miền Bắc + Miền Nam
        const bet = Number(t.totalBet) || (betMT + betMBMN);
        const win = Number(t.totalWin) || 0;

        // Góc nhìn nhà cái: Lời = tiền thu - tiền trả
        const net = bet - win;

        const hasData = (data.betList || []).length > 0;
        const hasWin = win > 0;

        const netStatus = net > 0
            ? `<span style="color:#00ff88; font-weight:bold;">Lời +${net.toLocaleString()}</span>`
            : (net < 0
                ? `<span style="color:#ff6b6b; font-weight:bold;">Lỗ ${Math.abs(net).toLocaleString()}</span>`
                : `<span style="color:#94a3b8;">0</span>`);

        const status = hasWin
            ? `<span class="blink-win">🟢 Có trúng</span>`
            : (hasData ? '🟡 Đã có số' : '⚪ Trống');

        let rowStyle = 'cursor:pointer;';
        if (g === activeGroup) {
            rowStyle += 'background:rgba(0,243,255,0.12);';
        } else if (hasWin) {
            rowStyle += 'background:rgba(255,77,77,0.08);';
        }

        html += `
            <tr style="${rowStyle}" onclick="selectGroupAndScroll('${g}')">
                <td><b>Nhóm ${g}</b>${g === activeGroup ? ' ←' : ''}</td>
                <td>${betMT.toLocaleString()}</td>
                <td>${betMBMN > 0 ? betMBMN.toLocaleString() : '—'}</td>
                <td style="color:#ff4d4d; font-weight:bold;">${win.toLocaleString()}</td>
                <td>${netStatus}</td>
                <td>${status}</td>
            </tr>`;
    }
    tbody.innerHTML = html;
}

// Danh sách tên đài dùng chung cho extractKQXSMeta() (tóm tắt hiện lên đầu
// bảng) VÀ parseKQXS() (gán đài cho từng cột số) — tách ra 1 chỗ duy nhất để
// khỏi có 2 bản dễ lệch nhau theo thời gian.
const KQXS_STATION_NAMES = [
    // ----- Miền Nam -----
    ['TP. HỒ CHÍ MINH', 'TP. Hồ Chí Minh'],
    ['TP HCM', 'TP. Hồ Chí Minh'],
    ['HỒ CHÍ MINH', 'TP. Hồ Chí Minh'],
    ['LONG AN', 'Long An'],
    ['BÌNH PHƯỚC', 'Bình Phước'],
    ['HẬU GIANG', 'Hậu Giang'],
    ['ĐỒNG THÁP', 'Đồng Tháp'],
    ['CÀ MAU', 'Cà Mau'],
    ['BẾN TRE', 'Bến Tre'],
    ['VŨNG TÀU', 'Vũng Tàu'],
    ['BÀ RỊA', 'Vũng Tàu'],
    ['BẠC LIÊU', 'Bạc Liêu'],
    ['ĐỒNG NAI', 'Đồng Nai'],
    ['CẦN THƠ', 'Cần Thơ'],
    ['SÓC TRĂNG', 'Sóc Trăng'],
    ['TÂY NINH', 'Tây Ninh'],
    ['AN GIANG', 'An Giang'],
    ['BÌNH THUẬN', 'Bình Thuận'],
    ['VĨNH LONG', 'Vĩnh Long'],
    ['BÌNH DƯƠNG', 'Bình Dương'],
    ['TRÀ VINH', 'Trà Vinh'],
    ['TIỀN GIANG', 'Tiền Giang'],
    ['KIÊN GIANG', 'Kiên Giang'],
    ['ĐÀ LẠT', 'Đà Lạt'],
    ['LÂM ĐỒNG', 'Đà Lạt'],

    // ----- Miền Trung -----
    ['THỪA THIÊN HUẾ', 'Thừa Thiên Huế'],
    ['THỪA THIÊN', 'Thừa Thiên Huế'],
    ['HUẾ', 'Thừa Thiên Huế'],
    ['PHÚ YÊN', 'Phú Yên'],
    ['ĐẮK LẮK', 'Đắk Lắk'],
    ['DAK LAK', 'Đắk Lắk'],
    ['QUẢNG NAM', 'Quảng Nam'],
    ['ĐÀ NẴNG', 'Đà Nẵng'],
    ['KHÁNH HÒA', 'Khánh Hòa'],
    ['QUẢNG BÌNH', 'Quảng Bình'],
    ['BÌNH ĐỊNH', 'Bình Định'],
    ['QUẢNG TRỊ', 'Quảng Trị'],
    ['GIA LAI', 'Gia Lai'],
    ['NINH THUẬN', 'Ninh Thuận'],
    ['QUẢNG NGÃI', 'Quảng Ngãi'],
    ['ĐẮK NÔNG', 'Đắk Nông'],
    ['DAK NONG', 'Đắk Nông'],
    ['KON TUM', 'Kon Tum'],

    // ----- Miền Bắc -----
    ['HÀ NỘI', 'Hà Nội'],
    ['QUẢNG NINH', 'Quảng Ninh'],
    ['BẮC NINH', 'Bắc Ninh'],
    ['HẢI PHÒNG', 'Hải Phòng'],
    ['NAM ĐỊNH', 'Nam Định'],
    ['THÁI BÌNH', 'Thái Bình']
];

function parseKQXS(rawText) {
    const meta = extractKQXSMeta(rawText);
    const winningPrizes = [];

    const validLengths = {
        'ĐB': [5, 6], 'G1': [5], 'G2': [5], 'G3': [5],
        'G4': [4, 5], 'G5': [4], 'G6': [3, 4], 'G7': [2, 3], 'G8': [2]
    };

    // "Đ" không phải \w trong regex JS nên \b không nhận biên trước "ĐB" khi
    // đứng sau khoảng trắng — dùng lookaround (?<=^|\s) thay cho \b ở mọi chỗ
    // liên quan tới ĐB để tránh bỏ sót nhãn giải đặc biệt.
    let cleaned = String(rawText)
        .replace(/Mã ĐB:[\s\S]*$/gi, '')
        .replace(/[＊*]/g, ' ')
        // Chuẩn hoá nhãn giải kiểu "G.8", "G .8", "Đ.B" (nhiều trang KQXS in
        // nhãn có dấu chấm) → "G8" / "ĐB". KHÔNG đụng \t và \n vì đó là mốc
        // phân biệt CỘT (đài) khi dán từ bảng HTML nhiều dòng/nhiều đài — mỗi
        // ô giải có thể xuống dòng cho nhiều số trong cùng 1 đài (G.4, G.6...).
        .replace(/(?<=^|[ \t\n])G\s*\.?\s*([1-8])(?=[ \t\n]|$)/gi, 'G$1')
        .replace(/(?<=^|[ \t\n])(?:Đ\s*\.?\s*B|DB)(?=[ \t\n]|$)/gi, 'ĐB')
        .replace(/(ĐẦU\s*ĐUÔI|ĐẦU|ĐUÔI)/gi, ' $1 ')
        // Tách nhãn dính liền số, VD "G897" → "G8 97"
        .replace(/(?<=^|[ \t\n])(ĐB|G[1-8])([0-9]+)/g, '$1 $2')
        .replace(/([0-9]+)(ĐB|G[1-8])(?=[ \t\n]|$)/g, '$1 $2');

    // Xác định vị trí TẤT CẢ nhãn giải theo đúng thứ tự xuất hiện trong text.
    const labelRe = /(?<=^|[ \t\n])(ĐB|G[1-8])(?=[ \t\n]|$)/g;
    const labels = [];
    let lm;
    while ((lm = labelRe.exec(cleaned))) {
        labels.push({ prize: lm[1], start: lm.index, end: lm.index + lm[0].length });
    }

    // Đài áp dụng cho TỪNG NHÃN GIẢI riêng — QUAN TRỌNG khi 1 tin nhắn gộp
    // KẾT QUẢ NHIỀU MIỀN cùng lúc (VD Nam/Trung ở trên, Bắc ở dưới, mỗi khối
    // có SỐ ĐÀI KHÁC NHAU). Trước đây dùng CHUNG 1 danh sách đài PHẲNG
    // (meta.stations, đếm theo thứ tự xuất hiện suốt CẢ văn bản) áp cho MỌI
    // nhãn giải — khi khối sau có ÍT CỘT HƠN khối trước (VD Bắc chỉ 1 đài
    // trong khi Nam/Trung phía trên có 2-3 đài), cột duy nhất của khối Bắc bị
    // GÁN NHẦM sang tên đài của khối Nam/Trung trước đó (vì trùng chỉ số cột
    // trong danh sách phẳng) — số của Miền Bắc bị ghi nhận như của 1 đài
    // Miền Nam/Trung, dò trúng/thua sai hoàn toàn dù số vẫn đúng.
    // Cách sửa: tìm lại vị trí xuất hiện tên đài NGAY TRONG "cleaned" (cùng hệ
    // toạ độ với nhãn giải — không tái dùng vị trí từ extractKQXSMeta vì đó
    // là chuỗi ĐÃ BIẾN ĐỔI KHÁC, độ dài lệch do các bước chuẩn hoá nhãn phía
    // trên). Với MỖI nhãn giải, chỉ lấy đài xuất hiện MỚI ngay TRƯỚC nhãn đó
    // (thường ở dòng tiêu đề đầu mỗi bảng) làm danh sách áp dụng — có tên đài
    // MỚI xuất hiện thì THAY HẲN danh sách cũ (báo hiệu bảng/miền mới bắt
    // đầu); không có gì mới thì giữ nguyên danh sách đang dùng.
    const cleanedUpper = cleaned.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const stationOccurrences = [];
    KQXS_STATION_NAMES.forEach(([key, full]) => {
        const k = key.normalize('NFD').replace(/[̀-ͯ]/g, '');
        let from = 0, idx;
        while ((idx = cleanedUpper.indexOf(k, from)) !== -1) {
            stationOccurrences.push({ idx, full });
            from = idx + k.length;
        }
    });
    stationOccurrences.sort((a, b) => a.idx - b.idx);

    const fallbackStations = meta.stations.length ? meta.stations : [null];
    let currentStations = fallbackStations;
    let occPtr = 0;
    const stationsForLabel = labels.map((label, li) => {
        const gapStart = li === 0 ? 0 : labels[li - 1].end;
        const gapEnd = label.start;
        const namesInGap = [];
        while (occPtr < stationOccurrences.length && stationOccurrences[occPtr].idx < gapEnd) {
            if (stationOccurrences[occPtr].idx >= gapStart && !namesInGap.includes(stationOccurrences[occPtr].full)) {
                namesInGap.push(stationOccurrences[occPtr].full);
            }
            occPtr++;
        }
        if (namesInGap.length) currentStations = namesInGap;
        return currentStations;
    });

    for (let li = 0; li < labels.length; li++) {
        const prize = labels[li].prize;
        const blockStart = labels[li].end;
        const blockEnd = (li + 1 < labels.length) ? labels[li + 1].start : cleaned.length;
        const block = cleaned.slice(blockStart, blockEnd);
        const lens = validLengths[prize] || [];
        const stationsHere = stationsForLabel[li];

        // Đài (cột) được phân tách bởi TAB khi dán từ bảng KQXS — mỗi đoạn
        // giữa 2 tab có thể chứa NHIỀU số xuống dòng (ô nhiều số như G.4/G.6,
        // vốn hay bị gán sai đài nếu chỉ đếm thứ tự phẳng như trước đây).
        let segments = block.split('\t');
        if (segments.length && segments[0].trim() === '') segments.shift();

        if (stationsHere.length > 1 && segments.length === 1) {
            // Không có tab phân cột (định dạng lạ/không chuẩn) → fallback:
            // chia đều theo thứ tự xuất hiện (đài 1, đài 2, đài 1, đài 2...).
            const nums = (block.match(/\d+/g) || []).filter(n => lens.includes(n.length));
            nums.forEach((num, i) => {
                // Thứ tự SỐ TRONG GIẢI của riêng đài đó (VD "g4lo6" = số thứ 6
                // của Giải 4) — không phải chỉ số i (i còn dùng chia vòng tròn
                // đài ở nhánh fallback này).
                const posInTier = Math.floor(i / stationsHere.length) + 1;
                winningPrizes.push({ number: num, prize, station: stationsHere[i % stationsHere.length] || null, dateStr: meta.dateStr || null, posInTier });
            });
            continue;
        }

        // QUAN TRỌNG: không được bỏ cột nào, kể cả khi không xác định được tên
        // đài cho cột đó (VD dán thiếu dòng "Thứ X / ngày / tên đài"). Trước
        // đây `if (segIdx >= stations.length) return` làm mất toàn bộ cột thứ
        // 2 trở đi khi stations chỉ có 1 phần tử ([null]) — tức mất nửa (hoặc
        // 2/3) dữ liệu KQXS bất cứ khi nào không nhận diện được tên đài, dù
        // KQXS vẫn có đủ nhiều cột. Cột không rõ tên đài → gán station = null
        // (không lọc theo đài khi dò, vẫn dò đúng theo số).
        segments.forEach((seg, segIdx) => {
            const station = segIdx < stationsHere.length ? stationsHere[segIdx] : null;
            const nums = (seg.match(/\d+/g) || []).filter(n => lens.includes(n.length));
            nums.forEach((num, i) => {
                // Thứ tự SỐ TRONG GIẢI của đài này (VD "g4lo6" = số thứ 6 của
                // Giải 4) — theo đúng thứ tự xuất hiện trong bảng KQXS gốc.
                winningPrizes.push({ number: num, prize, station: station || null, dateStr: meta.dateStr || null, posInTier: i + 1 });
            });
        });
    }

    window._lastKQXSMeta = meta;
    return winningPrizes;
}
// Bóc ngày KQXS thông minh: hỗ trợ "ngày dd/mm/yyyy", "ngày dd/mm" (thiếu năm),
// và định dạng bảng không có chữ "ngày" (VD: "Thứ 3\n25/08\tĐắk Lắk\tQuảng Nam").
function resolveKQXSDateStr(t) {
    let m = t.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/i)
        || t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
        || t.match(/(\d{1,2})[\/\-](\d{1,2})(?!\s*[\/\-]?\d)/);
    if (!m) return null;

    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (!day || !month || day > 31 || month > 12) return null;

    const now = new Date();
    let year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    if (m[3] && m[3].length === 2) year += 2000;

    if (!m[3]) {
        const guess = new Date(year, month - 1, day);
        if ((guess - now) / 86400000 > 200) year -= 1;
    }

    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function extractKQXSMeta(rawText) {
    const t = String(rawText || '');
    const region = (typeof getResultRegion === 'function') ? getResultRegion(t) : null;
    const dateStr = resolveKQXSDateStr(t);

    const upper = t.toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Tìm theo thứ tự xuất hiện trong text (indexOf)
    const found = [];
    KQXS_STATION_NAMES.forEach(([key, full]) => {
        const k = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const idx = upper.indexOf(k);
        if (idx >= 0 && !found.some(f => f.full === full)) {
            found.push({ idx, full });
        }
    });
    found.sort((a, b) => a.idx - b.idx);
    const stations = found.map(f => f.full);

    return { region, dateStr, stations };
}

function renderWinningLog() {
    const box = document.getElementById('winning-log-content');
    if (!box) return;

    let totalWinAll = 0;
    let totalHitCount = 0; // số con (dòng)
    let totalNhay = 0;     // tổng nháy
    let totalGroupsWin = 0;
    const blocks = []; // { g, isActive, html }

    groups.forEach(g => {
        const gObj = appData[g];
        if (!gObj || !gObj.betList) return;

        const hits = gObj.betList.filter(i => i.matched && (i.winAmount || 0) > 0);
        if (hits.length === 0) return;

        totalGroupsWin++;
        totalHitCount += hits.length;
        let groupWin = 0;
        let groupNhay = 0;
        let lines = '';

        hits.forEach(item => {
            const nhay = item.matchCount || 1;
            groupNhay += nhay;
            totalNhay += nhay;
            groupWin += item.winAmount || 0;
            totalWinAll += item.winAmount || 0;

            const stations = (item.stations || []).map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join('+') || '—';
            const prize = item.prizeInfo || '—';
            const rawType = item.betType || 'bl';
            const typeInfo = (typeof BET_TYPES !== 'undefined') ? BET_TYPES[rawType] : null;
            const typeLabel = typeInfo ? typeInfo.name : rawType.toUpperCase();

            lines += `
                <div style="font-size:12px; padding:4px 0; color:#e2e8f0; border-bottom:1px solid #1e293b;">
                    <span style="color:#ff4d4d; font-weight:bold; font-size:14px;">${item.num}</span>
                    <span style="color:#94a3b8;"> | ${typeLabel} <span style="color:#475569; font-size:10px;">(${rawType})</span></span>
                    <span style="color:#fbbf24;"> | ${stations}</span>
                    <span style="color:#38bdf8;"> | <b>${nhay} lần</b>: ${prize}</span>
                    <span style="color:#00ff88; float:right; font-weight:bold;">+${Number(item.winAmount).toLocaleString()}₫</span>
                </div>`;
        });

        const isActive = g === activeGroup;
        blocks.push({
            g,
            isActive,
            html: `
        <div style="margin-bottom:12px; border:1px solid ${isActive ? '#00f3ff' : '#334155'}; border-radius:6px; padding:8px 8px 4px; ${isActive ? 'background:rgba(0,243,255,0.06);' : ''}">
            <div style="color:#00f3ff; font-weight:bold; margin-bottom:4px;">
                ${isActive ? '📍 ' : ''}Nhóm ${g}${isActive ? ' <span style="color:#64748b; font-weight:normal; font-size:11px;">(đang xem)</span>' : ''} — ${hits.length} con • ${groupNhay} lần
            </div>
            ${lines}
            <div style="text-align:right; font-size:12px; color:#00ff88; margin-top:4px;">
                Cộng nhóm ${g}: <b>${groupWin.toLocaleString()}₫</b>
            </div>
        </div>`
        });
    });

    if (totalHitCount === 0) {
        box.innerHTML = `<div style="color:#64748b; text-align:center; padding:12px;">Chưa có dữ liệu trúng...</div>`;
        return;
    }

    // Nhóm đang xem hiện lên đầu, các nhóm còn lại giữ nguyên thứ tự
    blocks.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
    const html = blocks.map(b => b.html).join('');

    // Bảng tổng hợp "theo Miền / Đài" — GỘP XUYÊN SUỐT mọi nhóm (khác phần
    // liệt kê theo TỪNG NHÓM bên dưới) để biết ngay tổng trúng của miền/đài
    // nào, không phải dò từng dòng. Dùng cùng màu với thanh ngang lượt nhập
    // (REGION_HEADER_COLOR) để nhìn xuyên suốt nhất quán trong cả app.
    const regionOrder = ['MN', 'MT', 'MB'];
    const regionLabel = { MN: 'Miền Nam', MT: 'Miền Trung', MB: 'Miền Bắc' };
    const byRegion = {};
    groups.forEach(g => {
        const gObj = appData[g];
        if (!gObj || !gObj.betList) return;
        gObj.betList.filter(i => i.matched && (i.winAmount || 0) > 0).forEach(item => {
            const region = item.region || 'MT';
            const stationKey = (item.stations || []).map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join('+') || '—';
            const nhay = item.matchCount || 1;
            const win = item.winAmount || 0;
            if (!byRegion[region]) byRegion[region] = { con: 0, nhay: 0, win: 0, stations: {} };
            const rEntry = byRegion[region];
            rEntry.con += 1; rEntry.nhay += nhay; rEntry.win += win;
            if (!rEntry.stations[stationKey]) rEntry.stations[stationKey] = { con: 0, nhay: 0, win: 0 };
            rEntry.stations[stationKey].con += 1;
            rEntry.stations[stationKey].nhay += nhay;
            rEntry.stations[stationKey].win += win;
        });
    });
    const byRegionHtml = regionOrder.filter(r => byRegion[r]).map(r => {
        const rEntry = byRegion[r];
        const color = REGION_HEADER_COLOR[r] || REGION_HEADER_COLOR.MT;
        const stationRows = Object.entries(rEntry.stations).map(([station, s]) => `
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:11.5px; color:#cbd5e1; padding:2px 0 2px 16px;">
                <span>${station}</span>
                <span>${s.con} con • ${s.nhay} lần • <b style="color:#00ff88;">${s.win.toLocaleString()}₫</b></span>
            </div>`).join('');
        return `
        <div style="margin-bottom:6px; border-left:3px solid ${color}; padding-left:8px;">
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; font-weight:bold; color:${color};">
                <span>${regionLabel[r]}</span>
                <span>${rEntry.con} con • ${rEntry.nhay} lần • ${rEntry.win.toLocaleString()}₫</span>
            </div>
            ${stationRows}
        </div>`;
    }).join('');
    const byRegionBox = byRegionHtml
        ? `<div style="margin-bottom:10px; padding:8px 10px; background:rgba(15,23,42,0.6); border:1px solid #334155; border-radius:8px;">
                <div style="font-size:11px; color:#64748b; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">📊 Theo Miền / Đài</div>
                ${byRegionHtml}
           </div>`
        : '';

    box.innerHTML = `
        <div style="margin-bottom:8px; font-size:13px; color:#fbbf24;">
            Tổng: <b>${totalGroupsWin}</b> nhóm trúng • <b>${totalHitCount}</b> con • <b>${totalNhay}</b> lần •
            <b style="color:#00ff88">${totalWinAll.toLocaleString()}₫</b>
        </div>
        ${byRegionBox}
        ${html}`;
}

// ================= NHẬN DIỆN ĐÀI / MIỀN TỪ KQXS =================
function getResultRegion(rawText) {
    const t = rawText.toUpperCase();

    // Ưu tiên mã chính thức trước
    if (t.includes('XSMB') || t.includes('MIỀN BẮC') || t.includes('MB ')) return 'MB';
    if (t.includes('XSMT') || t.includes('MIỀN TRUNG') || t.includes('MT ')) return 'MT';
    if (t.includes('XSMN') || t.includes('MIỀN NAM') || t.includes('MN ')) return 'MN';

    // Fallback theo tên tỉnh
    if (t.includes('HÀ NỘI') || t.includes('QUẢNG NINH') || t.includes('BẮC NINH') || 
        t.includes('HẢI PHÒNG') || t.includes('NAM ĐỊNH') || t.includes('THÁI BÌNH')) return 'MB';

    if (t.includes('PHÚ YÊN') || t.includes('HUẾ') || t.includes('ĐẮK LẮK') || t.includes('QUẢNG NAM') ||
        t.includes('ĐÀ NẴNG') || t.includes('KHÁNH HÒA') || t.includes('QUẢNG BÌNH') || t.includes('BÌNH ĐỊNH') ||
        t.includes('QUẢNG TRỊ') || t.includes('GIA LAI') || t.includes('NINH THUẬN') || t.includes('QUẢNG NGÃI') ||
        t.includes('ĐẮK NÔNG') || t.includes('KON TUM')) return 'MT';

    if (t.includes('HỒ CHÍ MINH') || t.includes('TP.HCM') || t.includes('ĐỒNG THÁP') || t.includes('CÀ MAU') ||
        t.includes('BẾN TRE') || t.includes('VŨNG TÀU') || t.includes('BẠC LIÊU') || t.includes('ĐỒNG NAI') ||
        t.includes('CẦN THƠ') || t.includes('SÓC TRĂNG') || t.includes('TÂY NINH') || t.includes('AN GIANG') ||
        t.includes('BÌNH THUẬN') || t.includes('VĨNH LONG') || t.includes('BÌNH DƯƠNG') || t.includes('TRÀ VINH') ||
        t.includes('LONG AN') || t.includes('BÌNH PHƯỚC') || t.includes('HẬU GIANG') || t.includes('TIỀN GIANG') ||
        t.includes('KIÊN GIANG') || t.includes('ĐÀ LẠT') || t.includes('LÂM ĐỒNG')) return 'MN';

    return null;
}

function getStationFromResult(rawText) {
    const t = rawText.toUpperCase();

    // Ưu tiên mã chính thức + tên đầy đủ (tránh key ngắn gây nhầm)
    const map = [
        // Miền Trung
        ['XSQB', 'Quảng Bình'], ['QUẢNG BÌNH', 'Quảng Bình'],
        ['XSBDI', 'Bình Định'], ['BÌNH ĐỊNH', 'Bình Định'],
        ['XSQT', 'Quảng Trị'], ['QUẢNG TRỊ', 'Quảng Trị'],
        ['XSDNG', 'Đà Nẵng'], ['ĐÀ NẴNG', 'Đà Nẵng'],
        ['XSKH', 'Khánh Hòa'], ['KHÁNH HÒA', 'Khánh Hòa'],
        ['XSPY', 'Phú Yên'], ['PHÚ YÊN', 'Phú Yên'],
        ['XSDLK', 'Đắk Lắk'], ['ĐẮK LẮK', 'Đắk Lắk'],
        ['XSQNA', 'Quảng Nam'], ['QUẢNG NAM', 'Quảng Nam'],
        ['XSGL', 'Gia Lai'], ['GIA LAI', 'Gia Lai'],
        ['XSNT', 'Ninh Thuận'], ['NINH THUẬN', 'Ninh Thuận'],
        ['XSQNG', 'Quảng Ngãi'], ['QUẢNG NGÃI', 'Quảng Ngãi'],
        ['XSDNO', 'Đắk Nông'], ['ĐẮK NÔNG', 'Đắk Nông'],
        ['XSKT', 'Kon Tum'], ['KON TUM', 'Kon Tum'],
        ['XSTTH', 'Thừa Thiên Huế'], ['THỪA THIÊN HUẾ', 'Thừa Thiên Huế'], ['HUẾ', 'Thừa Thiên Huế'],

        // Miền Bắc
        ['XSHN', 'Hà Nội'], ['HÀ NỘI', 'Hà Nội'],
        ['XSQN', 'Quảng Ninh'], ['QUẢNG NINH', 'Quảng Ninh'],
        ['XSBN', 'Bắc Ninh'], ['BẮC NINH', 'Bắc Ninh'],
        ['XSHP', 'Hải Phòng'], ['HẢI PHÒNG', 'Hải Phòng'],
        ['XSND', 'Nam Định'], ['NAM ĐỊNH', 'Nam Định'],
        ['XSTB', 'Thái Bình'], ['THÁI BÌNH', 'Thái Bình'],

        // Miền Nam
        ['XSHCM', 'TP. Hồ Chí Minh'], ['TP.HCM', 'TP. Hồ Chí Minh'], ['HỒ CHÍ MINH', 'TP. Hồ Chí Minh'],
        ['XSCT', 'Cần Thơ'], ['CẦN THƠ', 'Cần Thơ'],
        ['XSDT', 'Đồng Tháp'], ['ĐỒNG THÁP', 'Đồng Tháp'],
        ['XSCM', 'Cà Mau'], ['CÀ MAU', 'Cà Mau'],
        ['XSBT', 'Bến Tre'], ['BẾN TRE', 'Bến Tre'],
        ['XSVT', 'Vũng Tàu'], ['VŨNG TÀU', 'Vũng Tàu'],
        ['XSBL', 'Bạc Liêu'], ['BẠC LIÊU', 'Bạc Liêu'],
        ['XSDN', 'Đồng Nai'], ['ĐỒNG NAI', 'Đồng Nai'],
        ['XSST', 'Sóc Trăng'], ['SÓC TRĂNG', 'Sóc Trăng'],
        ['XSTN', 'Tây Ninh'], ['TÂY NINH', 'Tây Ninh'],
        ['XSAG', 'An Giang'], ['AN GIANG', 'An Giang'],
        ['XSBTH', 'Bình Thuận'], ['BÌNH THUẬN', 'Bình Thuận'],
        ['XSVL', 'Vĩnh Long'], ['VĨNH LONG', 'Vĩnh Long'],
        ['XSBD', 'Bình Dương'], ['BÌNH DƯƠNG', 'Bình Dương'],
        ['XSTV', 'Trà Vinh'], ['TRÀ VINH', 'Trà Vinh'],
        ['XSLA', 'Long An'], ['LONG AN', 'Long An'],
        ['XSBP', 'Bình Phước'], ['BÌNH PHƯỚC', 'Bình Phước'],
        ['XSHG', 'Hậu Giang'], ['HẬU GIANG', 'Hậu Giang'],
        ['XSTG', 'Tiền Giang'], ['TIỀN GIANG', 'Tiền Giang'],
        ['XSKG', 'Kiên Giang'], ['KIÊN GIANG', 'Kiên Giang'],
        ['XSDL', 'Đà Lạt'], ['ĐÀ LẠT', 'Đà Lạt'], ['LÂM ĐỒNG', 'Đà Lạt']
    ];

    for (const [key, station] of map) {
        if (t.includes(key)) return station;
    }
    return null;
}

// ================= HÀM DÒ SỐ THÔNG MINH =================
function getBetTypeTiers(betType, region) {
    const t = (betType || '').toLowerCase().trim();
    const isMB = region === 'MB' || region === 'Miền Bắc';

    const REGIONAL = {
        'dau': isMB ? ['g7'] : ['g8'],
        'xc_dau': isMB ? ['g6'] : ['g7'],
        'dd': isMB ? ['g7', 'db'] : ['g8', 'db'],
        'dc': isMB ? ['g7', 'db'] : ['g8', 'db'],
        'xc': isMB ? ['g6', 'db'] : ['g7', 'db'],
        // "Cuối" theo đúng xác nhận Cocomi — MT/MN "5 Cuối" = G3+G2+G1+ĐB (5
        // lô); Miền Bắc KHÔNG có G3 trong tổ hợp này, chỉ có 4 lô: G2+G1+ĐB
        // (Bắc gọi là "4 Cuối"). Khác các loại "Đầu"/"Xỉu Chủ" ở trên (chỉ
        // đổi SỐ LÔ theo miền) — ở đây SỐ GIẢI GỘP trong tổ hợp cũng đổi
        // theo miền, không chỉ đổi số lô.
        // '4c' là mã KHÁC bạn Miền Bắc hay gõ cho ĐÚNG khái niệm này (đã bỏ
        // nghĩa "4 Càng" cũ) — dùng chung công thức với '5c'/'g3g2g1db'.
        '4c': isMB ? ['g2', 'g1', 'db'] : ['g3', 'g2', 'g1', 'db'],
        '5c': isMB ? ['g2', 'g1', 'db'] : ['g3', 'g2', 'g1', 'db'],
        'g3g2g1db': isMB ? ['g2', 'g1', 'db'] : ['g3', 'g2', 'g1', 'db']
    };
    if (REGIONAL[t]) return REGIONAL[t];

    const FIXED = {
        'duoi': ['db'], 'cuoi': ['db'], 'xc_duoi': ['db'],
        '12d': ['g7', 'g6', 'g5', 'g4'],
        '13d': ['g8', 'g7', 'g6', 'g5', 'g4'],
        // Các tổ hợp mới bổ sung theo xác nhận Cocomi (29/08/2026):
        // "5 Đầu" (MT/MN, 3C) = G7+G6+G5 = 5 lô.
        'g7g6g5': ['g7', 'g6', 'g5'],
        // "6 Đầu" (MT/MN, 2C) = G8+G7+G6+G5 = 6 lô.
        'g8g7g6g5': ['g8', 'g7', 'g6', 'g5'],
        // "12 Cuối" (MT/MN) = G4+G3+G2+G1+ĐB = 12 lô — KHÁC "12 Đầu"
        // (g7g6g5g4, tính từ đầu G7 xuống G4) dù trùng số lô 12 do ngẫu nhiên.
        'g4g3g2g1db': ['g4', 'g3', 'g2', 'g1', 'db'],
        // "10 Cuối" Miền Bắc = ĐB+G1+G2+G3 = 10 lô (đã xác nhận Cocomi).
        // Miền Trung/Nam CHƯA có xác nhận riêng cho "10cuoi" — tạm dùng
        // chung công thức này, cần hỏi lại nếu MT/MN có dùng thật.
        '10cuoi': ['g3', 'g2', 'g1', 'db'],
        // "14 Cuối" Miền Bắc = ĐB+G1+G2+G3+G4 = 14 lô (Cocomi xác nhận,
        // riêng cho Miền Bắc — MT/MN không có khái niệm này).
        '14cuoi': ['g4', 'g3', 'g2', 'g1', 'db']
    };
    if (FIXED[t]) return FIXED[t];

    if (t === 'db') return ['db'];
    if (/^g[1-8]$/.test(t)) return [t];

    // "g4lo6" = chỉ đúng SỐ THỨ 6 trong Giải 4 — vẫn cần khoanh về đúng tier
    // "g4" ở đây (kiểm tra vị trí cụ thể do prizeMatchesBet đảm nhận riêng).
    const gLo = t.match(/^g([1-8])lo\d+$/);
    if (gLo) return ['g' + gLo[1]];

    const tokens = t.match(/g[1-8]|db/g);
    if (tokens && tokens.length > 1) return tokens;

    return null;
}

function prizeMatchesBet(prizeLabel, betType, region, item, posInTier) {
    const p = String(prizeLabel || '').toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/s+/g, '');

    // item.tierOnly (VD "Gnhat. Le le x 50k" → tierOnly=['g1'], hoặc
    // "Db+G7. Chan chan x 35k" → tierOnly=['db','g7']) ép chỉ so với ĐÚNG các
    // giải đó (khớp 1 TRONG SỐ đó là đủ tính trúng), bất kể betType là loại
    // "cả cụm" (lẻ lẻ/chẵn chẵn/con giáp) vốn mặc định so như bao lô (mọi giải).
    const tierOnlyList = (item && Array.isArray(item.tierOnly) && item.tierOnly.length) ? item.tierOnly : null;
    if (tierOnlyList) {
        return tierOnlyList.some(source => {
            // "g4lo6" = chỉ khớp đúng SỐ THỨ 6 trong danh sách Giải 4 (theo
            // đúng thứ tự trong bảng KQXS gốc) — không phải bất kỳ số nào của
            // Giải 4. Miền nào không có đủ số thứ tự đó (VD Miền Bắc G4 chỉ
            // có 4 số) thì posInTier không bao giờ khớp → tự không tính trúng.
            const gLo = String(source || '').toLowerCase().match(/^g([1-8])lo(\d+)$/);
            if (gLo) return p === 'g' + gLo[1] && Number(posInTier) === Number(gLo[2]);
            const tier = String(source || '').toLowerCase();
            return tier === 'db'
                ? (p === 'db' || p.includes('db') || p.includes('dacbiet') || p.includes('gdb'))
                : p === tier;
        });
    }

    // Không có tierOnly → hành vi gốc: dựa theo đúng betType (VD "g4lo6" gõ
    // trực tiếp cho 1 số cụ thể, không qua loại "cả cụm").
    const gLo = String(betType || '').toLowerCase().match(/^g([1-8])lo(\d+)$/);
    if (gLo) {
        return p === 'g' + gLo[1] && Number(posInTier) === Number(gLo[2]);
    }
    const tiers = getBetTypeTiers(betType, region);
    if (!tiers) return true; // Bao lô / đá / xiên... → mọi giải có đuôi số đều tính
    return tiers.some(tier => tier === 'db'
        ? (p === 'db' || p.includes('db') || p.includes('dacbiet') || p.includes('gdb'))
        : p === tier);
}

function normalizeDateStr(s) {
    if (!s) return '';
    const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!m) return String(s).trim();
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${String(m[1]).padStart(2, '0')}/${String(m[2]).padStart(2, '0')}/${y}`;
}

// Gom các giải KQXS theo độ dài đuôi số (2/3/4/5 chữ số) để tra cứu O(1) thay
// vì quét tuần tự cả prizeList cho từng con số cược (trước đây dùng
// `p.number.endsWith(item.num)` trong vòng lặp lồng nhau — O(số_con ×
// số_giải), rất chậm/treo tab khi betList có hàng trăm nghìn/triệu dòng).
function buildPrizeSuffixIndex(prizeList) {
    const index = new Map(); // độ dài đuôi -> Map(đuôi số -> [giải...])
    for (const p of prizeList) {
        if (!p.number) continue;
        const numStr = String(p.number);
        const maxLen = Math.min(5, numStr.length);
        for (let len = 2; len <= maxLen; len++) {
            const suffix = numStr.slice(-len);
            let byLen = index.get(len);
            if (!byLen) { byLen = new Map(); index.set(len, byLen); }
            let arr = byLen.get(suffix);
            if (!arr) { arr = []; byLen.set(suffix, arr); }
            arr.push(p);
        }
    }
    return index;
}

const EMPTY_PRIZE_MATCHES = [];
function getCandidatePrizes(prizeIndex, num) {
    const byLen = prizeIndex.get(String(num || '').length);
    if (!byLen) return EMPTY_PRIZE_MATCHES;
    return byLen.get(num) || EMPTY_PRIZE_MATCHES;
}

async function checkAllResults() {
    const btn = document.getElementById('btn-check-results');
    if (btn && btn.disabled) return; // chống bấm liên tục khi đang dò (đang xử lý theo lô)

    const rawKQXS = document.getElementById('kqxs-input').value.trim();
    if (!rawKQXS) return showToast("Vui lòng dán nội dung Kết Quả Xổ Số!", "error");

    const prizeList = parseKQXS(rawKQXS);
    if (prizeList.length === 0) {
        return customAlert("Không bóc tách được con số KQXS hợp lệ nào!", "Thông Báo");
    }

    const resultRegion = (typeof getResultRegion === 'function') ? getResultRegion(rawKQXS) : null;
    const meta = window._lastKQXSMeta || (typeof extractKQXSMeta === 'function' ? extractKQXSMeta(rawKQXS) : {});
    const kqDate = normalizeDateStr(meta.dateStr || '');
    const todayStr = normalizeDateStr(new Date().toLocaleDateString('vi-VN'));
    // Ngày KQXS chỉ dùng để CẢNH BÁO — KHÔNG chặn dò, KHÔNG lọc theo từng dòng
    // cược (dò khớp theo số + đài, xem vòng lặp bên dưới).
    if (!kqDate) {
        showToast('⚠️ Không xác định được ngày của bảng KQXS vừa dán — vẫn dò theo số + đài, hãy tự kiểm tra lại.', 'error');
    } else if (kqDate !== todayStr) {
        showToast(`⚠️ KQXS ngày ${kqDate} — khác hôm nay (${todayStr}). Vẫn dò bình thường, hãy tự kiểm tra lại nội dung.`, 'error');
    }
    // Hiện dạng "viên thuốc" (pill) bo tròn thay vì chữ IN HOA trần trụi —
    // gọn, dễ quét mắt hơn, chỉ đổi màu/icon theo đúng 3 trạng thái, không
    // đổi ý nghĩa cảnh báo (vẫn không chặn dò, chỉ để người dùng tự đối chiếu).
    const dateStatusEl = document.getElementById('kqxs-date-status');
    if (dateStatusEl) {
        const pill = (bg, border, color, text) =>
            `<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; background:${bg}; border:1px solid ${border}; color:${color}; font-size:12px; font-weight:600;">${text}</span>`;
        if (!kqDate) {
            dateStatusEl.innerHTML = pill('rgba(248,113,113,0.12)', 'rgba(248,113,113,0.4)', '#fca5a5', '⚠️ Không rõ ngày KQXS — vẫn dò theo số + đài, tự kiểm tra lại');
        } else if (kqDate === todayStr) {
            dateStatusEl.innerHTML = pill('rgba(0,255,136,0.1)', 'rgba(0,255,136,0.35)', '#6ee7b7', `✅ KQXS ngày ${kqDate} — đúng hôm nay`);
        } else {
            dateStatusEl.innerHTML = pill('rgba(251,191,36,0.12)', 'rgba(251,191,36,0.4)', '#fde68a', `⚠️ KQXS ngày ${kqDate} — khác hôm nay (${todayStr})`);
        }
    }
    // Chỉ đồng bộ miền — KHÔNG ép 1 đài
    if (resultRegion) {
        const regionRadio = document.querySelector(`input[name="region-select"][value="${resultRegion}"]`);
        if (regionRadio) regionRadio.checked = true;
    }

    // Hiển thị số đã bóc (có đài nếu có)
    const parsedBox = document.getElementById('parsed-kqxs-display');
    const parsedList = document.getElementById('parsed-numbers-list');
    if (parsedBox) parsedBox.style.display = 'block';
    if (parsedList) {
        parsedList.innerText = prizeList.map(p => {
            const ab = p.station
                ? ((typeof STATION_ABBR !== 'undefined' && STATION_ABBR[p.station]) || p.station)
                : '';
            return `${p.prize}${ab ? '(' + ab + ')' : ''}:${p.number}`;
        }).join(' | ');
    }

    const prizeIndex = buildPrizeSuffixIndex(prizeList);
    // Tên đài THẬT SỰ CÓ trong lượt dán KQXS này — dùng để biết lượt dò hiện
    // tại có "phủ" tới đài của 1 dòng cược hay không. QUAN TRỌNG khi người
    // dùng dò TUẦN TỰ từng miền (dán Nam → dò → dán Trung → dò → dán Bắc →
    // dò): trước đây hễ 1 dòng KHÔNG khớp được số nào trong lượt dán hiện tại
    // (kể cả khi lượt này chỉ mang KQXS của miền KHÁC, không liên quan gì đến
    // đài của dòng đó) đều bị ghi đè thành "matched=false, winAmount=0" —
    // xoá mất kết quả trúng đã dò đúng từ lượt TRƯỚC đó của miền khác. Giờ:
    // dòng nào mà ĐÀI của nó hoàn toàn KHÔNG xuất hiện trong lượt dán hiện
    // tại thì BỎ QUA hẳn (không đụng vào matched/winAmount đang có), coi như
    // lượt này "chưa dò tới" dòng đó — giữ nguyên kết quả trúng cũ.
    const stationsInThisKQXS = new Set(prizeList.map(p => p.station).filter(Boolean));
    const hasUnnamedStationEntries = prizeList.some(p => !p.station);
    const CHECK_CHUNK_SIZE = 4000; // số dòng xử lý mỗi lô trước khi nhường luồng chính cho UI

    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.style.cursor = 'not-allowed'; }
    showToast('Đang dò kết quả...', 'info');

    try {
        for (const g of groups) {
            const groupObj = appData[g];
            if (!groupObj || !groupObj.betList) continue;

            const logs = [];
            groupObj.totals.totalWin = 0;
            const list = groupObj.betList;

            for (let start = 0; start < list.length; start += CHECK_CHUNK_SIZE) {
                const end = Math.min(start + CHECK_CHUNK_SIZE, list.length);
                for (let idx = start; idx < end; idx++) {
                    const item = list[idx];
                    // Dò theo SỐ + ĐÀI, không lọc theo ngày nhập tin — ngày KQXS chỉ
                    // dùng để cảnh báo hiển thị (xem dateStatusEl / toast ở trên).
                    const type = (item.betType || '').toLowerCase();
                    const itemRegion = item.region || resultRegion || 'MT';

                    // Đài của dòng này KHÔNG có mặt trong lượt dán hiện tại → lượt
                    // này "chưa dò tới" dòng này (VD đang dò Miền Bắc mà dòng này
                    // đặt cho đài Miền Nam) — BỎ QUA, giữ nguyên matched/winAmount
                    // đã có từ lượt dò TRƯỚC (nếu có), không ghi đè thành thua.
                    if (!hasUnnamedStationEntries && Array.isArray(item.stations) && item.stations.length > 0
                        && !item.stations.some(s => stationsInThisKQXS.has(s))) {
                        continue;
                    }

                    // Đá thẳng (2 số) / Đá chéo-xiên (3+ số): item.num lưu dạng
                    // "50-60" (nối dấu gạch) nên KHÔNG BAO GIỜ khớp được suffix
                    // số nguyên bên dưới — trước đây các dòng đá không hề được
                    // dò trúng (Tiền trúng luôn là "—" dù kết quả thế nào). Cả
                    // cụm số trong pairNums là MỘT cược duy nhất — thiếu 1 số
                    // không về là thua cả cụm (đúng theo xác nhận đá xiên).
                    if (Array.isArray(item.pairNums) && item.pairNums.length >= 2) {
                        let allHit = true;
                        const hitLabels = [];
                        for (const n of item.pairNums) {
                            const numCandidates = getCandidatePrizes(prizeIndex, n);
                            let found = null;
                            for (const p of numCandidates) {
                                if (p.station && item.stations && item.stations.length > 0 && !item.stations.includes(p.station)) continue;
                                // Đá/Chéo/Xiên mặc định dò bao lô (mọi giải) như trước
                                // giờ — nhưng nếu dòng này có tierOnly (VD "G4. 12 chéo
                                // 34 chéo 56 x10k" → chỉ dò riêng Giải 4), phải lọc
                                // đúng giải đó mới tính, không phải hễ số về đâu cũng
                                // tính. prizeMatchesBet() tự trả về true khi không có
                                // tierOnly (giữ nguyên hành vi bao lô cũ, không đổi gì).
                                if (!prizeMatchesBet(p.prize, item.betType, itemRegion, item)) continue;
                                found = p;
                                break;
                            }
                            if (!found) { allHit = false; break; }
                            const ab = found.station
                                ? ((typeof STATION_ABBR !== 'undefined' && STATION_ABBR[found.station]) || found.station)
                                : '';
                            hitLabels.push(`${n}:${found.prize}${ab ? '(' + ab + ')' : ''}`);
                        }
                        if (allHit) {
                            item.matched = true;
                            item.matchCount = 1;
                            item.prizeInfo = hitLabels.join(', ');
                            const fin = calculateItemFinancials(item, itemRegion);
                            item.winAmount = fin.winAmount;
                            groupObj.totals.totalWin += item.winAmount;
                            logs.push(
                                `${item.region || ''} ${item.num} ${item.betType} ${item.originalAmount}k → +${item.winAmount.toLocaleString()}₫ (Đá/Xiên: ${item.prizeInfo})`
                            );
                        } else {
                            item.matched = false;
                            item.matchCount = 0;
                            item.prizeInfo = '';
                            item.winAmount = 0;
                        }
                        continue;
                    }

                    const isSpecificPrize = Boolean(item.tierOnly) || (typeof getBetTypeTiers === 'function'
                        && getBetTypeTiers(type, itemRegion) !== null);

                    const candidates = getCandidatePrizes(prizeIndex, item.num);
                    let hitPrizes = [];

                    for (const p of candidates) {
                        // Lọc theo đài của TỪNG giải (hỗ trợ 3–4 đài / ngày)
                        if (p.station && item.stations && item.stations.length > 0) {
                            if (!item.stations.includes(p.station)) continue;
                        }

                        if (isSpecificPrize) {
                            if (typeof prizeMatchesBet === 'function' && !prizeMatchesBet(p.prize, type, itemRegion, item, p.posInTier)) continue;
                        }

                        const ab = p.station
                            ? ((typeof STATION_ABBR !== 'undefined' && STATION_ABBR[p.station]) || p.station)
                            : '';
                        hitPrizes.push(ab ? `${p.prize}(${ab})` : (p.prize || '?'));
                    }

                    if (hitPrizes.length > 0) {
                        item.matched = true;
                        item.matchCount = hitPrizes.length;
                        item.prizeInfo = hitPrizes.join(', ');
                        const fin = calculateItemFinancials(item, item.region || resultRegion || 'MT');
                        item.winAmount = fin.winAmount;
                        groupObj.totals.totalWin += item.winAmount;
                        logs.push(
                            `${item.region || ''} ${item.num} ${item.betType} ${item.originalAmount}k → +${item.winAmount.toLocaleString()}₫ (${item.matchCount} lần: ${item.prizeInfo})`
                        );
                    } else {
                        item.matched = false;
                        item.matchCount = 0;
                        item.prizeInfo = '';
                        item.winAmount = 0;
                    }
                }

                // Nhường luồng chính cho trình duyệt vẽ lại/xử lý sự kiện giữa các lô,
                // tránh treo tab khi betList lên tới hàng trăm nghìn/triệu dòng.
                if (end < list.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            groupObj.winningLogs = logs;

            if (typeof recalculateTotals === 'function') {
                recalculateTotals(g);
            } else {
                groupObj.totals.net = groupObj.totals.totalWin - (groupObj.totals.totalBet || 0);
            }
        }
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; }
    }

    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof renderWinningLog === 'function') renderWinningLog();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    if (typeof calcCapitalShare === 'function') calcCapitalShare();

        const stLabel = (meta.stations || [])
        .map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s)
        .join(', ') || '—';
    showToast(
        `Đã dò! ${prizeList.length} số • KQXS: ${kqDate || 'không rõ ngày'} • ${stLabel}`,
        'success'
    );
}

// ================= HÀM XÓA INPUT (FIX LỖI LINE 105) =================
// CHỈ xóa 2 Ô NHẬP (Nhập Nhanh + KQXS) — KHÔNG đụng tới kết quả đã dò nữa.
// Trước đây hàm này còn xóa luôn trạng thái ĐÃ DÒ (trúng/trượt) của MỌI
// nhóm — nghĩa là dò xong Miền Nam, chỉ cần bấm nút này để dọn ô trước khi
// dán tiếp KQXS Miền Bắc là MẤT LUÔN kết quả trúng của Miền Nam vừa dò được.
// Giờ tách riêng: xóa Ô NHẬP dùng nút này (clearInputText), xóa KẾT QUẢ DÒ
// dùng riêng clearMatchedResults() bên dưới — 2 việc khác nhau, 2 nút khác
// nhau, để dò tuần tự nhiều miền không lo mất kết quả cũ.
function clearInputText() {
    const smartInp = document.getElementById('smart-input');
    const kqxsInp = document.getElementById('kqxs-input');
    const parsedList = document.getElementById('parsed-numbers-list');
    const parsedBox = document.getElementById('parsed-kqxs-display');
    const dateStatusEl = document.getElementById('kqxs-date-status');

    if (smartInp) smartInp.value = '';
    if (kqxsInp) kqxsInp.value = '';
    if (parsedList) parsedList.innerHTML = '';
    if (parsedBox) parsedBox.style.display = 'none';
    if (dateStatusEl) dateStatusEl.textContent = '';

    showToast("Đã xóa nội dung 2 ô nhập (kết quả đã dò vẫn giữ nguyên)", "info");
}

// Xóa trạng thái ĐÃ DÒ (trúng/trượt/tiền thắng) — KHÔNG đụng betList/
// inputHistory nên số và tiền đã nhập vẫn giữ nguyên 100%. Tách riêng khỏi
// clearInputText() để dò xong 1 miền rồi chuyển sang miền khác không bị mất
// kết quả cũ chỉ vì dọn ô nhập. `allGroups=false` chỉ xóa nhóm đang chọn,
// `allGroups=true` xóa kết quả dò của TẤT CẢ nhóm.
function clearMatchedResults(allGroups) {
    const targetGroups = allGroups ? groups : [activeGroup];
    let clearedCount = 0;
    targetGroups.forEach(g => {
        const gObj = appData[g];
        if (!gObj || !Array.isArray(gObj.betList)) return;
        gObj.betList.forEach(item => {
            if (item.matched) clearedCount++;
            item.matched = false;
            item.matchCount = 0;
            item.prizeInfo = '';
            item.winAmount = 0;
        });
        gObj.winningLogs = [];
        if (typeof recalculateTotals === 'function') recalculateTotals(g);
    });

    if (typeof renderMatrixTable === 'function') renderMatrixTable();
    if (typeof renderWinningLog === 'function') renderWinningLog();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof saveAppDataToDBDebounced === 'function') saveAppDataToDBDebounced();

    showToast(
        allGroups
            ? `Đã xóa kết quả dò của TẤT CẢ nhóm (${clearedCount} dòng đang trúng)`
            : `Đã xóa kết quả dò của nhóm "${activeGroup}" (${clearedCount} dòng đang trúng)`,
        "info"
    );
}

function confirmClearMatchedResults(allGroups) {
    if (typeof showModal !== 'function') return clearMatchedResults(allGroups);
    showModal({
        title: '⚠️ Xác Nhận Xóa Kết Quả Dò',
        body: allGroups
            ? 'Xóa trạng thái TRÚNG/TRƯỢT của <b>TẤT CẢ NHÓM</b>? Số và tiền đã nhập vẫn giữ nguyên, chỉ mất kết quả dò (phải dò lại từ đầu).'
            : `Xóa trạng thái TRÚNG/TRƯỢT của nhóm <b>"${activeGroup}"</b> đang chọn? Số và tiền đã nhập vẫn giữ nguyên, chỉ mất kết quả dò (phải dò lại từ đầu).`,
        confirmText: 'Xóa Kết Quả Dò',
        confirmClass: 'btn-red',
        cancelText: 'Hủy Bỏ',
        showCancel: true,
        onConfirm: () => clearMatchedResults(allGroups)
    });
}

// ================= HÀM BÁO CÁO DÒ SỐ - TÍNH CHUẨN VỐN & THÀNH TIỀN =================
function generateOutputReport(stationName) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory || gObj.inputHistory.length === 0) {
        return showToast("Chưa có dữ liệu cược để xuất báo cáo!", "error");
    }

    let reportText = `📊 BÁO CÁO DÒ SỐ - NHÓM ${activeGroup.toUpperCase()}\n`;
    reportText += `🎯 Đài/Miền: ${stationName}\n`;
    reportText += `-----------------------------------\n`;

    let totalBetGroup = 0;
    let totalWinGroup = 0;
    let htmlCardList = '';

    gObj.inputHistory.forEach((session, sIdx) => {
        const daiStr = session.stations?.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) || s).join(', ') || 'Chung';
        reportText += `📩 Lượt #${sIdx + 1} (${session.time || 'Mới'}) [${daiStr}]:\n`;
        
        let sessionHitHtml = '';

        (session.items || []).forEach(item => {
            const prizes = (typeof BET_TYPES !== 'undefined' && BET_TYPES[item.betType]?.prizes) || (item.num.length === 3 ? 17 : 18);
            const stationCount = (item.stations && item.stations.length > 0) ? item.stations.length : 1;
            
            // TÍNH VỐN CHUẨN CHÍNH XÁC: (Số k gốc) * 1000 * số giải * số đài
            const itemOrigK = item.originalAmount || (item.amount >= 1000 ? item.amount / 1000 : item.amount) || 1;
            const cost = itemOrigK * 1000 * prizes * stationCount;
            const winVal = item.winAmount || 0;
            
            totalBetGroup += cost;
            totalWinGroup += winVal;

            if (item.matched) {
                reportText += `  🟢 SỐ TRÚNG: ${item.num} (${(item.betType||'BL').toUpperCase()}) -> Trúng ${winVal.toLocaleString()}₫ [${item.prizeInfo || 'Trúng'}]\n`;
                
                sessionHitHtml += `
                    <div style="display:flex; justify-content:space-between; background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:6px; padding:6px 10px; margin-top:4px;">
                        <div>
                            <b style="color:#00ff88; font-size:15px;">${item.num}</b> 
                            <span style="font-size:11px; background:#10b981; color:#000; padding:1px 5px; border-radius:3px; font-weight:bold; margin-left:5px;">${(item.betType||'BL').toUpperCase()}</span>
                            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">G.Trúng: ${item.prizeInfo || 'Trúng'}</div>
                        </div>
                        <div style="text-align:right;">
                            <b style="color:#00ff88;">+${winVal.toLocaleString()}₫</b>
                        </div>
                    </div>
                `;
            }
        });

        if (!session.items.some(i => i.matched)) {
            reportText += `  🔴 Không trúng số nào\n`;
            sessionHitHtml = `<div style="font-size:12px; color:#64748b; font-style:italic; padding:4px 0;">Không có số trúng</div>`;
        }

        reportText += `\n`;

        htmlCardList += `
            <div style="background:#1e293b; border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid #334155;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:6px; margin-bottom:6px; font-size:12px; color:#38bdf8;">
                    <b>📩 Tin nhắn #${sIdx + 1} (${session.time || 'Vừa xong'})</b>
                    <span>Đài: ${daiStr}</span>
                </div>
                ${sessionHitHtml}
            </div>
        `;
    });

    const netGroup = totalWinGroup - totalBetGroup;
    reportText += `-----------------------------------\n`;
    reportText += `💰 Vốn đánh: ${totalBetGroup.toLocaleString()}₫\n`;
    reportText += `🏆 Tiền trúng: ${totalWinGroup.toLocaleString()}₫\n`;
    reportText += `⚖️ THÀNH TIỀN: ${netGroup >= 0 ? '+' : ''}${netGroup.toLocaleString()}₫\n`;

    const modalBodyHtml = `
        <div style="color:#f8fafc; font-family:sans-serif;">
            <div style="display:flex; justify-content:space-between; background:#0f172a; padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid #334155;">
                <div>
                    <span style="font-size:12px; color:#94a3b8;">Tổng tiền cược:</span>
                    <div style="font-weight:bold; font-size:15px; color:#fbbf24;">${totalBetGroup.toLocaleString()}₫</div>
                </div>
                <div>
                    <span style="font-size:12px; color:#94a3b8;">Tổng trúng:</span>
                    <div style="font-weight:bold; font-size:15px; color:#00ff88;">${totalWinGroup.toLocaleString()}₫</div>
                </div>
                <div>
                    <span style="font-size:12px; color:#94a3b8;">Thành tiền:</span>
                    <div style="font-weight:bold; font-size:15px; color:${netGroup >= 0 ? '#00ff88' : '#f87171'};">
                        ${netGroup >= 0 ? '+' : ''}${netGroup.toLocaleString()}₫
                    </div>
                </div>
            </div>

            <div style="max-height:260px; overflow-y:auto; padding-right:4px;">
                ${htmlCardList}
            </div>
        </div>
    `;

    showModal({
        title: `🏆 Kết Quả Dò Số - Nhóm ${activeGroup}`,
        body: modalBodyHtml,
        confirmText: "📋 Sao Chép Báo Cáo Zalo",
        confirmClass: "btn-green",
        cancelText: "Đóng",
        // Không có showCancel:true thì modal chỉ có 1 nút "Sao Chép" — muốn
        // xem xong rồi đóng lại (không cần chép) phải tải lại cả trang.
        showCancel: true,
        onConfirm: () => {
            navigator.clipboard.writeText(reportText);
            showToast("Đã chép báo cáo vào bộ nhớ tạm!", "success");
        }
    });
}

// Hàm phụ trợ: Lọc đúng loại giải theo thể loại cược
function isPrizeMatchBetType(prizeName, betType) {
    const pName = prizeName.toLowerCase();
    if (['bl', 'chan_chan', 'le_le', 'chan_le', 'le_chan', 'giap', '3c', 'dx'].includes(betType)) return true;
    if (betType === 'g8') return pName.includes('8') || pName.includes('g8');
    if (betType === 'g1') return pName.includes('1') || pName.includes('g1');
    if (betType === 'db') return pName.includes('db') || pName.includes('đặc biệt');
    if (betType === 'dd') return pName.includes('8') || pName.includes('db') || pName.includes('đặc biệt');
    return true;
}

function setMiss(item) {
    item.matched = false;
    item.prizeInfo = '';
    item.winAmount = 0;
}

// Biến toàn cục (đặt gần đầu file nếu chưa có)
let selectedBetIds = new Set();

function updateBulkDeleteButton() {
    const btn = document.getElementById('btn-bulk-delete');
    if (!btn) return;
    
    if (selectedBetIds.size > 0) {
        btn.style.display = 'inline-block';
        btn.innerText = `Xóa ${selectedBetIds.size} số đã chọn`;
    } else {
        btn.style.display = 'none';
    }
}

function toggleSelectBet(id, checkbox) {
    if (checkbox.checked) {
        selectedBetIds.add(id);
    } else {
        selectedBetIds.delete(id);
    }
    updateBulkDeleteButton();
}

function bulkDeleteSelected() {
    if (selectedBetIds.size === 0) return;

    // Dùng modal đẹp của app thay vì confirm trình duyệt
    showModal({
        title: 'Xác nhận xóa',
        body: `Bạn chắc chắn muốn xóa <b style="color:#ff4d4d">${selectedBetIds.size}</b> số đã chọn?`,
        isPrompt: false,
        confirmText: 'Xóa Ngay',
        confirmClass: 'btn-red',
        cancelText: 'Hủy Bỏ',
        // Thiếu showCancel:true thì modal KHÔNG có nút Hủy nào cả (chỉ 1 nút
        // Xác Nhận) — muốn từ chối phải tải lại cả trang mới tắt được modal.
        // Hành động XÓA phải luôn có đường lùi an toàn.
        showCancel: true,
        onConfirm: () => {
            const gObj = appData[activeGroup];
            if (!gObj) return;
            
            gObj.betList = gObj.betList.filter(item => !selectedBetIds.has(item.id));
            selectedBetIds.clear();
            recalculateTotals(activeGroup);
            renderMatrixTable();
            saveAppDataToDB();
            showToast('Đã xóa các số đã chọn', 'success');
        }
    });
}

function deleteAllBets() {
    showModal({
        title: 'Xóa toàn bộ',
        body: `Bạn chắc chắn muốn xóa <b style="color:#ff4d4d">TOÀN BỘ</b> số của nhóm <b>${activeGroup}</b>?`,
        isPrompt: false,
        confirmText: 'Xóa Ngay',
        confirmClass: 'btn-red',
        cancelText: 'Hủy Bỏ',
        // Thiếu showCancel:true thì modal KHÔNG có nút Hủy nào cả (chỉ 1 nút
        // Xác Nhận) — muốn từ chối phải tải lại cả trang mới tắt được modal.
        // Đây là hành động XÓA TOÀN BỘ 1 nhóm, càng phải có đường lùi an toàn.
        showCancel: true,
        onConfirm: () => {
            if (!appData[activeGroup]) return;
            
            // Xóa sạch cả 2 mảng dữ liệu gốc và mảng hiển thị lượt nhập
            appData[activeGroup].betList = [];
            appData[activeGroup].inputHistory = [];
            
            if (typeof selectedBetIds !== 'undefined') selectedBetIds.clear();
            
            recalculateTotals(activeGroup);
            renderMatrixTable();
            saveAppDataToDB();
            showToast('Đã xóa toàn bộ dữ liệu nhóm ' + activeGroup, 'success');
        }
    });
}

// ================= MẪU DỮ LIỆU =================
function loadSampleMB() {
    document.getElementById('kqxs-input').value =
`XSMB> XSMB Thứ 3 (Quảng Ninh)
ĐẦUĐUÔIĐB29183
04G155349
13, 6G237265 21266
29G340833 36729 67077
56251 97269 23553
33, 4, 542, 9G46985 4935 9042 1686
51, 1, 3, 4G57962 4616 0776
8699 4334 2074
62, 5, 6, 973, 4, 6, 7G6873 082 954
82, 3, 5, 6G751 04 92 13
92, 9Mã ĐB: 4 8 11 12 14 15 (FA)`;
    showToast("Đã dán mẫu XSMB", "info");
}

function loadSampleMT() {
    document.getElementById('kqxs-input').value =
`Xổ số Khánh Hòa ngày 16/08 (Chủ Nhật)
XSMT> XSKH 16/08 ĐẦU ĐUÔI
G8 86
G7 973
G6 5108 9119 2854
G5 8888
G4 95216 23398 91377 45123 88291 10293 67482
G3 44080 31645
G2 48343
G1 02314
ĐB 685303`;
    showToast("Đã dán mẫu XSMT chuẩn 18 giải Khánh Hòa", "info");
}
function loadSampleBetData() {
    document.getElementById('smart-input').value =
`3c 87 225 300 147 122 55
2c 180 108 40 680 200 450
68 bl 50
1-10 bl 5k`;
    showToast("Đã dán dữ liệu cược mẫu", "info");
}

// ================= RENDER GROUP & SUMMARY =================
function renderGroupButtons() {
    const container = document.getElementById('group-buttons');
    if (!container) return;

    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '10px';
    container.style.overflow = 'hidden';
    container.style.padding = '6px 0';

    const scrollDiv = document.createElement('div');
    scrollDiv.style.display = 'flex';
    scrollDiv.style.overflowX = 'auto';
    scrollDiv.style.whiteSpace = 'nowrap';
    scrollDiv.style.gap = '8px';
    scrollDiv.style.flex = '1';
    scrollDiv.style.maxWidth = 'calc(100% - 145px)';
    scrollDiv.style.paddingBottom = '4px';
    scrollDiv.style.scrollbarWidth = 'thin';

    groups.forEach(g => {
        const btn = document.createElement('button');
        btn.className = `group-btn ${g === activeGroup ? 'active' : ''}`;
        btn.style.padding = '7px 14px';

        const gObj = appData[g] || {};
        // Đếm tổng số lượt nhập (tin nhắn) từ inputHistory
        const msgCount = gObj.inputHistory ? gObj.inputHistory.length : 0;

        btn.innerHTML = msgCount > 0
            ? `Nhóm ${g} <span style="background:#00f3ff;color:#000;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:5px;font-weight:600;">${msgCount}</span>`
            : `Nhóm ${g}`;

        btn.onclick = () => switchGroup(g);
        btn.ondblclick = (e) => { e.stopPropagation(); renameGroup(g); };
        btn.oncontextmenu = (e) => { e.preventDefault(); deleteGroup(g); };
        btn.title = "Click: chọn nhóm\nDouble-click: đổi tên\nChuột phải: xóa nhóm";
        scrollDiv.appendChild(btn);
    });

    container.appendChild(scrollDiv);

    const addBtn = document.createElement('button');
    addBtn.className = 'add-group-btn';
    addBtn.innerText = '➕ Thêm Nhóm';
    addBtn.style.flexShrink = '0';
    addBtn.style.padding = '7px 14px';
    addBtn.onclick = addNewGroup;
    container.appendChild(addBtn);
}

function switchGroup(g) {
    activeGroup = g;
    renderGroupButtons();
    document.getElementById('current-group-label').innerText = `Nhóm ${activeGroup}`;
    document.getElementById('table-group-title').innerText = `Nhóm ${activeGroup}`;
    renderMatrixTable();
    saveAppDataToDB();

    // === THÊM DÒNG NÀY ===
    if (typeof calcCapitalShare === 'function') calcCapitalShare();
    if (typeof renderWinningLog === 'function') renderWinningLog();
}

/**
 * Click dòng nhóm ở bảng Tổng Thể
 * → Chọn nhóm + nhảy xuống khung Chia tiền
 */
function selectGroupAndScroll(groupName) {
    // 1. Chọn nhóm
    if (typeof switchGroup === 'function') {
        switchGroup(groupName);
    } else {
        activeGroup = groupName;
        if (typeof renderGroupButtons === 'function') renderGroupButtons();
        if (typeof renderMatrixTable === 'function') renderMatrixTable();
    }

    // 2. Cập nhật lại số liệu chia tiền
    if (typeof calcCapitalShare === 'function') {
        calcCapitalShare();
    }

    // 3. Nhảy xuống khung Chia tiền
    setTimeout(() => {
        const box = document.querySelector('.summary-card') 
                 || document.getElementById('capital-percent')?.closest('div[style*="margin-top:20px"]');
        
        if (box) {
            box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Hiệu ứng nháy nhẹ để dễ nhìn
            box.style.transition = 'box-shadow 0.3s';
            box.style.boxShadow = '0 0 0 3px #00f3ff';
            setTimeout(() => {
                box.style.boxShadow = '';
            }, 1200);
        }
    }, 150);

    if (typeof showToast === 'function') {
        showToast(`Đã chọn Nhóm ${groupName}`, 'info');
    }
}

// ================= XUẤT / NHẬP =================
function exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ groups, appData }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `DuLieu_Lode_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Đã xuất file JSON thành công!", "success");
}

function importDataJSON(event) {
    const fileReader = new FileReader();
    fileReader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.groups && imported.appData) {
                groups = imported.groups;
                appData = imported.appData;
                if (groups.length === 0) groups = ['A'];
                activeGroup = groups[0];
                renderGroupButtons();
                renderMatrixTable();
                updateGrandSummary();
                saveAppDataToDB();
                showToast("Nhập dữ liệu thành công!", "success");
            } else {
                customAlert("Cấu trúc File JSON không hợp lệ!", "Lỗi Dữ Liệu");
            }
        } catch (err) {
            customAlert("Lỗi đọc file JSON!", "Lỗi");
        }
    };
    if (event.target.files[0]) fileReader.readAsText(event.target.files[0]);
}

// ================= OCEAN =================
function initOcean() {
    const ocean = document.getElementById('ocean');
    if (!ocean) return;
    ocean.innerHTML = '';
    const sand = document.createElement('div');
    sand.className = 'sand';
    ocean.appendChild(sand);
    for (let i = 0; i < 25; i++) {
        let b = document.createElement('div');
        b.className = 'bubble';
        b.style.width = (Math.random() * 18 + 4) + 'px';
        b.style.height = b.style.width;
        b.style.left = Math.random() * 100 + '%';
        b.style.animationDuration = (Math.random() * 7 + 4) + 's';
        b.style.animationDelay = (Math.random() * 5) + 's';
        ocean.appendChild(b);
    }
    const fishes = ['🐠', '🐟', '🐡', '🦈', '🦑', '🐙', '🦐', '🦞', '💲'];
    for (let i = 0; i < 18; i++) {
        let f = document.createElement('div');
        f.className = 'fish';
        f.innerText = fishes[Math.floor(Math.random() * fishes.length)];
        f.style.top = (Math.random() * 65 + 8) + '%';
        f.style.fontSize = (Math.random() * 14 + 18) + 'px';
        f.style.animationDuration = (Math.random() * 12 + 9) + 's';
        f.style.animationDelay = (Math.random() * 8) + 's';
        if (Math.random() > 0.5) f.style.animationName = 'swimReverse';
        ocean.appendChild(f);
    }
    for (let i = 0; i < 14; i++) {
        let s = document.createElement('div');
        s.className = 'seaweed';
        s.style.left = (i * 7.2 + 2) + '%';
        s.style.height = (Math.random() * 90 + 70) + 'px';
        s.style.animationDuration = (Math.random() * 4 + 3) + 's';
        ocean.appendChild(s);
    }
    const bottomItems = ['⭐', '🌟', '🐚', '💎', '🦀'];
    for (let i = 0; i < 12; i++) {
        let item = document.createElement('div');
        item.className = 'bottom-item';
        item.innerText = bottomItems[Math.floor(Math.random() * bottomItems.length)];
        item.style.left = (Math.random() * 94 + 3) + '%';
        item.style.bottom = (Math.random() * 28 + 4) + 'px';
        item.style.fontSize = (Math.random() * 12 + 16) + 'px';
        item.style.animationDelay = (Math.random() * 4) + 's';
        ocean.appendChild(item);
    }
}

// ================= PATTERN LOCK =================
const canvas = document.getElementById('pattern-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let points = [], isDrawing = false, currentPattern = [];
let savedPattern = null;

function revealLockScreen() {
    if (isUnlocked) return;
    const lockScreen = document.getElementById('lock-screen');
    if (!lockScreen) return;
    lockScreen.style.display = 'flex';
    lockScreen.style.zIndex = '9999';
    lockScreen.style.background = 'rgba(0, 8, 20, 0.88)';
    initPatternCanvas();
    showToast("Đã mở màn hình đăng nhập", "info");
}

function getPatternKey(userName) {
    return STORAGE_KEY_PATTERN + "_" + (userName || "default").trim().toUpperCase();
}

function saveUserPattern(userName, patternArray) {
    const key = getPatternKey(userName);
    const encrypted = encryptPattern(patternArray);
    localStorage.setItem(key, encrypted);
}

function loadUserPattern(userName) {
    const key = getPatternKey(userName);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return decryptPattern(stored);
}

function removeUserPattern(userName) {
    const key = getPatternKey(userName);
    localStorage.removeItem(key);
}

function initPatternCanvas() {
    if (!canvas) return;
    points = [];
    const size = 3, spacing = 75, offset = 55;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            points.push({ x: offset + c * spacing, y: offset + r * spacing, id: r * size + c });
        }
    }
    const nameInput = document.getElementById('user-name-input');
    const userName = nameInput ? nameInput.value.trim() : currentUser;
    savedPattern = loadUserPattern(userName);
    if (savedPattern) {
        document.getElementById('pattern-instruction').innerText = `Vẽ mật khẩu của "${userName}"`;
    } else {
        document.getElementById('pattern-instruction').innerText = `User mới → Vẽ hình khóa MỚI cho "${userName}"`;
    }
    currentPattern = [];
    drawPattern();
}

// ================= XUẤT BÁO CÁO ĐẸP (HTML → mở Excel / in PDF) =================
function exportGroupExcel() {
    const gObj = appData[activeGroup];
    if (!gObj || !(gObj.betList || []).length) {
        return showToast('Nhóm này chưa có dữ liệu!', 'error');
    }

    recalculateTotals(activeGroup);

    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN');
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    // Xuất file tôn trọng bộ lọc "Chỉ trúng / Chỉ trật" + ô tìm kiếm đang
    // áp dụng trên Bảng Chi Tiết (dùng chung detailItemMatches để đảm bảo file
    // xuất ra luôn khớp chính xác với những gì đang hiển thị trên màn hình).
    const exportHasFilter = typeof hasActiveDetailFilter === 'function' && hasActiveDetailFilter();
    let exportedCount = 0;
    let exportedSessionCount = 0;
    let exportedTotalBet = 0;
    let exportedTotalWin = 0;

    let rowsHtml = '';
    const history = gObj.inputHistory || [];

    history.forEach((session, sIdx) => {
        const items = exportHasFilter
            ? (session.items || []).filter(it => detailItemMatches(it, session))
            : (session.items || []);
        if (items.length === 0) return;
        exportedCount += items.length;
        exportedSessionCount++;

        // Header mỗi tin
        let sessionBet = 0, sessionWin = 0;
        items.forEach(it => {
            const f = calculateItemFinancials(it, it.region || 'MT');
            sessionBet += f.totalItemCost;
            sessionWin += (it.matched ? (it.winAmount || 0) : 0);
        });
        exportedTotalBet += sessionBet;
        exportedTotalWin += sessionWin;

        // Thành tiền góc nhìn nhà cái = Cược - Trúng
        const sessionNet = sessionBet - sessionWin;
        const stations = (items[0]?.stations || []).map(s => STATION_ABBR[s] || s).join(', ') || '—';
        const exportRegionColor = REGION_HEADER_COLOR[items[0]?.region || session.region] || REGION_HEADER_COLOR.MT;

        rowsHtml += `
        <tr style="background:#1e293b;color:${exportRegionColor};border-top:2px solid ${exportRegionColor};">
            <td colspan="11" style="padding:10px 12px;font-weight:bold;">
                📩 Tin #${sIdx + 1} &nbsp;|&nbsp; ${session.time || ''} &nbsp;|&nbsp; Đài: ${stations}
                &nbsp;|&nbsp; Vốn: ${sessionBet.toLocaleString()}₫
                &nbsp;|&nbsp; Trúng: ${sessionWin.toLocaleString()}₫
                &nbsp;|&nbsp; <span style="color:${sessionNet >= 0 ? '#00ff88' : '#ff6b6b'}">
                    Thành tiền: ${sessionNet >= 0 ? '+' : ''}${sessionNet.toLocaleString()}₫
                </span>
            </td>
        </tr>`;

        items.forEach((item, idx) => {
            const fin = calculateItemFinancials(item, item.region || 'MT');
            const win = item.matched ? (item.winAmount || 0) : 0;
            
            // Thành tiền mỗi con số = Tiền cược - Tiền trúng (Nhà cái)
            const net = fin.totalItemCost - win;
            
            const typeName = (BET_TYPES[item.betType]?.name) || item.betType || '';
            const st = (item.stations || []).map(s => STATION_ABBR[s] || s).join('+') || '—';
            const bg = item.matched ? 'background:#3f1a1a;' : (idx % 2 === 0 ? 'background:#0f172a;' : 'background:#111827;');
            const numColor = item.matched ? '#ff4d4d;font-weight:bold;' : '#00f3ff;';

            rowsHtml += `
            <tr style="${bg}">
                <td style="text-align:center;color:#64748b;">${idx + 1}</td>
                <td style="text-align:center;">${st}</td>
                <td style="text-align:center;color:#a855f7;">${item.region || ''}</td>
                <td style="text-align:center;font-size:16px;color:${numColor}">${item.num}</td>
                <td style="text-align:center;color:#f472b6;">${typeName}</td>
                <td style="text-align:center;color:#38bdf8;">${item.originalAmount || 0}k</td>
                <td style="text-align:center;color:#94a3b8;">${fin.soLo}</td>
                <td style="text-align:right;color:#fbbf24;font-weight:bold;">${fin.totalItemCost.toLocaleString()}₫</td>
                <td style="text-align:right;color:${win > 0 ? '#ff4d4d' : '#64748b'};font-weight:bold;">
                    ${win > 0 ? win.toLocaleString() + '₫' : '—'}
                </td>
                <td style="text-align:right;color:${net >= 0 ? '#00ff88' : '#ff6b6b'};font-weight:bold;">
                    ${(net >= 0 ? '+' : '') + net.toLocaleString()}₫
                </td>
                <td style="text-align:center;color:#fbbf24;font-size:12px;">${item.prizeInfo || ''}</td>
            </tr>`;
        });
    });

    if (exportHasFilter && exportedCount === 0) {
        return showToast('Không có dòng nào khớp bộ lọc hiện tại để xuất!', 'error');
    }

    // Khi đang lọc, tổng tiền tính theo đúng phần đã xuất (không lấy tổng cả nhóm).
    const totalBet = exportHasFilter ? exportedTotalBet : (gObj.totals.totalBet || 0);
    const totalWin = exportHasFilter ? exportedTotalWin : (gObj.totals.totalWin || 0);

    // Thành tiền chuẩn nhà cái = Cược - Trúng
    const houseNet = totalBet - totalWin;

    const filterLabel = !exportHasFilter ? null
        : detailMatchFilter === 'matched' ? '🎯 Chỉ số TRÚNG'
        : detailMatchFilter === 'unmatched' ? '🚫 Chỉ số TRƯỢT'
        : null;
    const searchLabel = detailSearchTerm ? `Tìm: "${detailSearchTerm}"` : null;
    const filterMetaParts = [filterLabel, searchLabel].filter(Boolean);

    // Lấy % hùn vốn từ giao diện màn hình hiện tại
    const percentVal = parseFloat(document.getElementById('detail-percent')?.value || 0);
    const percentAmount = Math.round((houseNet * percentVal) / 100);

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Báo cáo Nhóm ${activeGroup} - ${dateStr}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#0b1220; color:#e2e8f0; padding:24px; margin:0; }
  h1 { color:#00f3ff; margin:0 0 4px; font-size:22px; }
  .meta { color:#94a3b8; font-size:13px; margin-bottom:18px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#1e293b; color:#00f3ff; padding:10px 8px; border:1px solid #334155; text-align:center; }
  td { padding:8px; border:1px solid #1e293b; }
  .summary { margin-top:20px; display:flex; gap:16px; flex-wrap:wrap; }
  .box { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:14px 18px; min-width:160px; }
  .box .label { font-size:12px; color:#94a3b8; }
  .box .value { font-size:20px; font-weight:bold; margin-top:4px; }
  @media print {
    body { background:#fff; color:#000; }
    h1, th { color:#0f766e; }
    td, th { border-color:#ccc; }
  }
</style>
</head>
<body>
  <h1>📊 Báo cáo cược – Nhóm ${activeGroup}${filterLabel ? ` — ${filterLabel}` : ''}</h1>
  <div class="meta">
    Xuất lúc ${timeStr} ${dateStr} &nbsp;|&nbsp;
    Tổng ${exportHasFilter ? exportedCount : (gObj.betList || []).length} số &nbsp;|&nbsp;
    ${exportHasFilter ? exportedSessionCount : history.length} tin
    ${filterMetaParts.length ? `&nbsp;|&nbsp; <b style="color:#fbbf24;">${filterMetaParts.join(' · ')}</b>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Đài</th>
        <th>Miền</th>
        <th>Số</th>
        <th>Loại</th>
        <th>Giá (k)</th>
        <th>Số lô</th>
        <th>Tổng vốn</th>
        <th>Tiền trúng</th>
        <th>Thành tiền</th>
        <th>Giải</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="summary">
    <div class="box">
      <div class="label">Tổng vốn cược</div>
      <div class="value" style="color:#fbbf24;">${totalBet.toLocaleString()}₫</div>
    </div>
    <div class="box">
      <div class="label">Tổng trúng</div>
      <div class="value" style="color:#ff4d4d;">${totalWin.toLocaleString()}₫</div>
    </div>
    <div class="box">
      <div class="label">Thành tiền (Lời/Lỗ nhà cái)</div>
      <div class="value" style="color:${houseNet >= 0 ? '#00ff88' : '#ff6b6b'};">
        ${houseNet >= 0 ? '+' : ''}${houseNet.toLocaleString()}₫
      </div>
    </div>
    ${percentVal > 0 ? `
    <div class="box">
      <div class="label">Tiền Hùn vốn (${percentVal}%)</div>
      <div class="value" style="color:#38bdf8;">
        ${percentAmount >= 0 ? '+' : ''}${percentAmount.toLocaleString()}₫
      </div>
    </div>` : ''}
  </div>

  <p style="margin-top:24px;font-size:12px;color:#64748b;">
    Mở file này bằng trình duyệt → Ctrl+P để in hoặc lưu PDF.<br>
    Hoặc mở bằng Excel (File → Mở) để chỉnh sửa.
  </p>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BaoCao_Nhom_${activeGroup}_${now.toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`Đã xuất báo cáo nhóm ${activeGroup} (mở bằng trình duyệt / Excel)`, 'success');
}

document.addEventListener('input', function(e) {
    // Chỉ xử lý ô số trong popup nhập tay
    if (e.target.id !== 'manual-so') return;

    const val = e.target.value.trim();
    const hint = document.getElementById('manual-so-hint');
    const preview = document.getElementById('manual-preview');
    const loaiSelect = document.getElementById('manual-loai');

    if (!val) {
        if (hint) hint.textContent = '';
        if (preview) preview.innerHTML = '';
        return;
    }

    const nums = val.match(/\d{2,4}/g) || [];
    if (nums.length === 0) {
        if (hint) hint.textContent = 'Chưa nhận được số hợp lệ';
        return;
    }

    // Gợi ý loại cược theo độ dài số
    const firstLen = nums[0].length;
    if (firstLen === 2 && loaiSelect && loaiSelect.value === 'bl') {
        // giữ nguyên
    } else if (firstLen === 3 && loaiSelect) {
        // có thể tự đổi sang 3c nếu muốn (tùy bạn bật)
        // loaiSelect.value = '3c';
    }

    if (hint) {
        hint.textContent = `Nhận được ${nums.length} số → ${nums.map(n => n.padStart(n.length === 2 ? 2 : 3, '0')).join(', ')}`;
    }

    // Preview tiền
    const tien = parseFloat(document.getElementById('manual-tien')?.value) || 0;
    const donvi = document.getElementById('manual-donvi')?.value || 'k';
    const heso = (donvi === 'k' || donvi === 'n') ? 1000 : 1;
    const tienVND = tien * heso;

    if (preview) {
        preview.innerHTML = `Sẽ thêm <b style="color:#00f3ff">${nums.length}</b> dòng × <b style="color:#00ff88">${tienVND.toLocaleString()}₫</b> = <b style="color:#fbbf24">${(nums.length * tienVND).toLocaleString()}₫</b>`;
    }
});

function drawPattern() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = currentPattern.includes(p.id) ? '#00ff88' : '#00f3ff';
        ctx.shadowColor = currentPattern.includes(p.id) ? '#00ff88' : '#00f3ff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });
    if (currentPattern.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < currentPattern.length; i++) {
            let pt = points.find(p => p.id === currentPattern[i]);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.lineWidth = 4;
        ctx.stroke();
    }
}

if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
        if (!isUnlocked) {
            isDrawing = true;
            currentPattern = [];
            checkPoint(e);
        }
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!isUnlocked && isDrawing) checkPoint(e);
    });
    canvas.addEventListener('pointerup', () => { isDrawing = false; });
}

function checkPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    points.forEach(p => {
        if (Math.hypot(p.x - x, p.y - y) < 20) {
            if (!currentPattern.includes(p.id)) {
                currentPattern.push(p.id);
                drawPattern();
            }
        }
    });
}

function handleUnlockAttempt() {
    const nameInput = document.getElementById('user-name-input').value.trim();
    if (!nameInput) return showToast("Vui lòng nhập Tên User / Nhóm trước!", "error");
    currentUser = nameInput;
    localStorage.setItem(STORAGE_KEY_USER, currentUser);
    if (currentPattern.length < 3) return showToast("Vui lòng vẽ nối ít nhất 3 điểm!", "error");

    const userPattern = loadUserPattern(currentUser);
    if (!userPattern) {
        const newUserName = currentUser;
        const newPattern = [...currentPattern];
        currentPattern = [];
        drawPattern();
        customPrompt("🔒 XÁC THỰC ADMIN", `User "${newUserName}" chưa tồn tại. Nhập mã Admin để tạo mới...`, "", (inputCode) => {
            if (!inputCode) return showToast("Đã hủy tạo tài khoản!", "error");
            if (!verifyAdminCode(inputCode)) {
                return showToast("❌ Mã Admin không đúng! Không thể tạo tài khoản mới.", "error");
            }
            saveUserPattern(newUserName, newPattern);
            savedPattern = [...newPattern];
            currentPattern = [...newPattern];
            showToast(`Đã tạo mật khẩu hình cho "${newUserName}"`, "success");
            executeUnlock();
        });
        return;
    }
    if (JSON.stringify(currentPattern) === JSON.stringify(userPattern)) {
        showToast(`Xin chào ${currentUser}!`, "success");
        executeUnlock();
    } else {
        showToast("Sai hình khóa của user này!", "error");
        currentPattern = [];
        drawPattern();
    }
}

function executeUnlock() {
    isUnlocked = true;
    const nameInput = document.getElementById('user-name-input');
    currentUser = (nameInput ? nameInput.value.trim() : "") || "Nhóm Quản Lý 01";
    localStorage.setItem(STORAGE_KEY_USER, currentUser);
    document.getElementById('display-user-name').innerText = currentUser;
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    pauseOcean();
    renderGroupButtons();
    renderMatrixTable();
    updateGrandSummary();
}

function lockApp() {
    isUnlocked = false;
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'none';
    resumeOcean();
    currentPattern = [];
}

function pauseOcean() {
    const ocean = document.getElementById('ocean');
    if (ocean) ocean.style.display = 'none';
}

function resumeOcean() {
    const ocean = document.getElementById('ocean');
    if (ocean) ocean.style.display = 'block';
}

function triggerSecureResetPattern() {
    if (isUnlocked) return;
    customPrompt("🔒 XÁC THỰC ADMIN", "Nhập mã Admin...", "", (inputCode) => {
        if (!inputCode) return;
        if (!verifyAdminCode(inputCode)) {
            return showToast("❌ Mã Admin không đúng!", "error");
        }
        const html = `
            <div style="text-align:center; padding:8px 0;">
                <p style="margin-bottom:18px; font-size:15px;">Chọn hành động reset mật khẩu:</p>
                <div style="display:flex; flex-direction:column; gap:10px; max-width:280px; margin:0 auto;">
                    <button class="btn btn-orange" onclick="adminResetOneUser()">Reset 1 User cụ thể</button>
                    <button class="btn btn-red" onclick="adminResetAllUsers()">Reset TẤT CẢ User</button>
                    <button class="btn btn-blue" onclick="promptSetNewAdminCode()">🔑 Đổi Mã Admin</button>
                    <button class="btn btn-gray" onclick="document.getElementById('custom-modal-overlay').style.display='none'">Hủy</button>
                </div>
            </div>`;
        showModal({ title: "Admin - Reset Mật khẩu", body: html, isPrompt: false });
        setTimeout(() => {
            const btnContainer = document.getElementById('modal-buttons');
            if (btnContainer) btnContainer.style.display = 'none';
        }, 30);
    });
}

// Đặt lại MÃ ADMIN (không phải mật khẩu người dùng thường) về đúng mã mặc
// định gốc — dùng khi chính admin QUÊN mã Admin vừa tự đổi qua
// promptSetNewAdminCode(). Vì lý do đó KHÔNG thể đòi nhập lại mã Admin hiện
// tại (đang bị quên) như triggerSecureResetPattern() — chỉ hỏi xác nhận 1
// lần để tránh bấm nhầm (Ctrl+Shift+Q) ngoài ý muốn.
function triggerResetAdminCodeToDefault() {
    if (isUnlocked) return;
    const html = `
        <div style="text-align:center; padding:8px 0;">
            <p style="margin-bottom:14px; font-size:15px;">Đặt lại <b>Mã Admin</b> về đúng mã mặc định gốc (mã trước khi đổi)?</p>
            <p style="margin-bottom:18px; font-size:13px; opacity:.8;">Dùng khi quên mã Admin vừa đổi. Mã Admin tùy chỉnh hiện tại sẽ bị xoá vĩnh viễn.</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn btn-red" onclick="confirmResetAdminCodeToDefault()">Đặt lại về mặc định</button>
                <button class="btn btn-gray" onclick="document.getElementById('custom-modal-overlay').style.display='none'">Hủy</button>
            </div>
        </div>`;
    showModal({ title: "⚠️ Reset Mã Admin Về Mặc Định", body: html, isPrompt: false });
    setTimeout(() => {
        const btnContainer = document.getElementById('modal-buttons');
        if (btnContainer) btnContainer.style.display = 'none';
    }, 30);
}

function confirmResetAdminCodeToDefault() {
    localStorage.removeItem(ADMIN_HASH_KEY);
    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    showToast("✅ Đã đặt lại Mã Admin về mặc định gốc!", "success");
}

// ================= 1. HÀM CHUẨN HÓA TIẾNG VIỆT =================
function removeAccents(str) {
    if (!str) return '';
    return str.replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
let manualRows = [];

// ================= 2. HÀM DỊCH CHUỖI NHẬP THÔNG MINH =================
function expandNumbers(inputStr) {
    if (!inputStr) return [];
    
    // Chuẩn hóa loại bỏ dấu tiếng Việt hoàn toàn
    let strNorm = removeAccents(inputStr.toLowerCase().trim());
    let resultNums = [];

    // 1. Dạng kéo range: 20->30, 20den30, 20 den 30
    const rangeMatch = strNorm.match(/^(\d{2,3})\s*(?:->|den)\s*(\d{2,3})$/);
    if (rangeMatch) {
        let start = parseInt(rangeMatch[1], 10);
        let end = parseInt(rangeMatch[2], 10);
        let padLen = rangeMatch[1].length;
        if (start <= end) {
            for (let i = start; i <= end; i++) {
                resultNums.push(i.toString().padStart(padLen, '0'));
            }
        }
        return resultNums;
    }

    // Dấu gạch nối là cú pháp ghép Đá, không phải kéo dãy.
    if (/^\d{2,3}(?:-\d{2,3})+$/.test(strNorm)) return strNorm.split('-');

    // 2. Nhận diện "giáp" / "giap" / "12 giap" / "12 con giap"
    if (strNorm === 'giap' || strNorm === '12 giap' || strNorm === '12 con giap') {
        return ALL_ZODIAC_NUMS;
    }

    // 2.5. "Đầu N" (N=0..9): dàn 10 số có hàng chục = N, VD "đầu 3" / "dau3"
    // → 30,31,...,39. "Đầu 10" là cách gọi nhầm quen thuộc của "Đầu 1"
    // (10..19) — hiểu luôn cho khỏi lỗi. KHÔNG đụng "dau" đứng một mình
    // (không có số theo sau) vì đó vẫn là con giáp Dậu như trước giờ.
    strNorm = strNorm.replace(/\bdau\s*(10|[0-9])\b/g, (_, d) => {
        const tensDigit = d === '10' ? 1 : Number(d);
        const base = tensDigit * 10;
        return Array.from({ length: 10 }, (_, i) => String(base + i).padStart(2, '0')).join(' ');
    });

    // 3. Quét các bộ đôi chẵn lẻ (Chẵn Chẵn, Lẻ Lẻ, Chẵn Lẻ, Lẻ Chẵn)
    for (const [pairKey, pairNums] of Object.entries(PAIR_SETS_NORM)) {
        if (strNorm.includes(pairKey)) {
            strNorm = strNorm.replace(pairKey, pairNums.join(' '));
        }
    }

    // "đảo" (đã bỏ dấu thành "dao"): hoán vị đủ các chữ số của những số CỤ
    // THỂ người gõ (VD "812 612 512 dao" → mỗi số nở đủ hoán vị chữ số).
    // Chỉ áp dụng cho số gõ tay, KHÔNG áp dụng cho dàn có sẵn (giáp/chẵn lẻ)
    // vì các dàn đó vốn đã là tập số cố định, hoán vị không có ý nghĩa gì
    // thêm (chỉ trùng lặp lại chính nó).
    const isDao = /\bdao\b/.test(strNorm);
    strNorm = strNorm.replace(/\bdao\b/g, ' ');

    // 4. Tách từ khóa và chuyển đổi
    const tokens = strNorm.split(/[,\s]+/);
    tokens.forEach(tok => {
        if (!tok) return;
        if (tok === 'chan') {
            for (let i = 0; i <= 98; i += 2) resultNums.push(i.toString().padStart(2, '0'));
        } else if (tok === 'le') {
            for (let i = 1; i <= 99; i += 2) resultNums.push(i.toString().padStart(2, '0'));
        } else if (ZODIAC_MAP[tok]) {
            resultNums.push(...ZODIAC_MAP[tok]);
        } else if (!isNaN(tok)) {
            if (isDao && typeof digitPermutations === 'function') resultNums.push(...digitPermutations(tok));
            else resultNums.push(tok);
        }
    });

    return [...new Set(resultNums)];
}

function openSmartManualModal() {
    manualRows = [{ num: '', type: 'bl', price: 5 }];
    document.getElementById('smart-manual-modal').style.display = 'flex';
    renderSmartManualStations();
    renderSmartRows();
    setTimeout(() => document.getElementById('smart-input-0')?.focus(), 0);
}

function closeSmartManualModal() {
    document.getElementById('smart-manual-modal').style.display = 'none';
}

function renderSmartManualStations() {
    const container = document.getElementById('smart-station-list');
    if (!container) return;
    
    const currentRegion = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const stations = selectedStations.length
        ? [...selectedStations]
        : ((typeof getTodayStations === 'function') ? getTodayStations(currentRegion) : ['Đài Mặc Định']);
    
    container.innerHTML = stations.map((s, idx) => `
        <label style="font-size:12px; color:#fff; display:flex; align-items:center; gap:4px; background:#0f172a; padding:4px 8px; border-radius:4px; border:1px solid #334155;">
            <input type="checkbox" class="smart-station-cb" value="${s}" ${selectedStations.length ? 'checked' : (idx === 0 ? 'checked' : '')} onchange="calculateSmartTotals()"> ${s}
        </label>
    `).join('');
}

function renderSmartRows() {
    const tbody = document.getElementById('smart-manual-rows');
    if (!tbody) return;
    // Đài/miền đã chọn SẴN từ đầu (trước khi gõ số) — dùng luôn để hiện
    // đúng 1 giải áp dụng cho miền đó (VD "Đầu (Giải 8)" khi đang nạp Trung),
    // khỏi phải ghi chung chung cả 2 miền rồi bắt người nhập tự suy luận.
    const smartRegion = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';

    tbody.innerHTML = manualRows.map((row, index) => {
        const displayType = getDropdownDisplayType(row.type);
        const typeOptions = getManualBetTypeOptions(displayType, smartRegion);

        return `
            <tr>
                <td style="padding:4px; border:1px solid #334155; text-align:center;">
                    <input type="checkbox" class="smart-row-check" data-index="${index}" onchange="calculateSmartTotals()" title="Chọn dòng để chia tổng tiền">
                </td>
                <td style="padding:4px; border:1px solid #334155;">
                    <input type="text" value="${row.num}" id="smart-input-${index}"
                           style="width:100%; padding:6px; background:#0f172a; border:1px solid #334155; color:#fff; border-radius:4px;" 
                           oninput="onInputSmartRow(${index}, 'num', this.value)"
                           onkeydown="handleSmartKeyDown(event, ${index})"
                           placeholder="Vd: 68, 89 hoặc 20->30 hoặc ty hoặc 812 612 dao">
                </td>
                <td style="padding:4px; border:1px solid #334155;">
                    <select style="width:100%; padding:6px; background:#0f172a; border:1px solid #334155; color:#fff; border-radius:4px;" 
                            onchange="onInputSmartRow(${index}, 'type', this.value)">
                        ${typeOptions}
                    </select>
                </td>
                <td style="padding:4px; border:1px solid #334155;">
                    <input type="number" value="${row.price}" 
                           style="width:100%; padding:6px; text-align:center; background:#0f172a; border:1px solid #334155; color:#00ff88; font-weight:bold; border-radius:4px;" 
                           oninput="onInputSmartRow(${index}, 'price', this.value)">
                </td>
                <td style="padding:4px; border:1px solid #334155; text-align:right; color:#fbbf24; font-weight:bold; padding-right:8px;" id="smart-cost-${index}">
                    0 ₫
                </td>
                <td style="padding:4px; border:1px solid #334155; text-align:center;">
                    <button class="btn btn-sm btn-red" style="padding:2px 6px;" onclick="removeSmartRow(${index})">✕</button>
                </td>
            </tr>
        `;
    }).join('');

    const selectAll = document.getElementById('smart-select-all');
    if (selectAll) selectAll.checked = false;

    calculateSmartTotals();
}

// CẬP NHẬT TRỰC TIẾP KHÔNG RE-RENDER DOM SẼ KHÔNG BỊ MẤT FOCUS KHI GÕ SỐ
function onInputSmartRow(index, field, value) {
    manualRows[index][field] = value;

    if (field === 'num') {
        const trimmed = value.trim();
        const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
        const firstToken = tokens[0] || '';
        const linkedInput = trimmed.match(/^\d{2,3}(?:-\d{2,3})+$/);
        // Chỉ tự nhảy loại khi dòng đang ở loại "mặc định/chưa chọn gì đặc
        // biệt" (bl/2c/3c) — nếu người dùng đã tự tay chọn hẳn 1 loại khác
        // rồi thì không được ghi đè lựa chọn của họ.
        const isGenericType = ['bl', '2c', '3c'].includes(manualRows[index].type);
        // Gõ nhiều số cách nhau khoảng trắng/phẩy, kèm từ khóa đá NGAY CUỐI
        // (VD "23 45 59 cheo", "23 30 da") — tự nhận diện thành đá luôn,
        // khỏi cần thêm cột hay bắt phải nối dấu gạch ngang mới hiểu. Từ
        // khóa "cheo"/"xien" mà chỉ có 2 số thì tự hiểu là "Đá Thẳng" (y hệt
        // quy tắc ở ô Nhập Nhanh) — Đá Thẳng bắt buộc ĐÚNG 2 số.
        const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : '';
        const trailingPairType = lastToken ? mapBetType(lastToken) : '';
        const hasTrailingPairKeyword = tokens.length >= 3 && ['da', 'dx', 'dv'].includes(trailingPairType);
        if (/^(?:\d{2,3}\s*(?:đến|den|->)\s*\d{2,3})$/i.test(trimmed)) {
            // "Dãy số" (VD "20 đến 30") CHỈ là cách bung số nhanh — giống hệt
            // "đảo"/con giáp — KHÔNG PHẢI 1 loại cược riêng, nên KHÔNG được
            // ép cứng thành 1 mã cố định (trước đây ép 'day_so', 1 mã có tỷ
            // lệ CỐ ĐỊNH kiểu 2C — dãy số 3 chữ số như "200 đến 300" bị tính
            // nhầm giá 2C thay vì đúng giá 3C). Chỉ tự đoán 2C/3C theo đúng
            // độ dài số khi đang ở loại chung chung (giống bao lô số thường)
            // — đã tự chọn hẳn 1 giải/Đá cụ thể rồi thì GIỮ NGUYÊN, không ghi đè.
            if (isGenericType) {
                const rangeDigits = trimmed.match(/^\d{2,3}/)?.[0].length || 2;
                manualRows[index].type = rangeDigits === 3 ? '3c' : '2c';
            }
        } else if (linkedInput) {
            manualRows[index].type = linkedInput[0].split('-').length > 2 ? 'dx' : 'da';
        } else if (isGenericType && hasTrailingPairKeyword) {
            const numberCount = tokens.length - 1;
            manualRows[index].type = (['dx', 'dv'].includes(trailingPairType) && numberCount < 3) ? 'da' : trailingPairType;
        } else if (isGenericType) {
            // Nhận diện từ khóa (con giáp, chẵn chẵn, giáp, giải N, đặc
            // biệt...) bằng ĐÚNG bộ nhận diện dùng chung với ô Nhập Nhanh
            // Thông Minh (mapBetType) — gõ "ran"/"heo"/"chẵn chẵn"/"giáp" tự
            // nhảy đúng loại đó. Trước đây chỉ đoán theo ĐỘ DÀI chữ nên
            // "ran"/"heo"/"đảo" (đều 3 ký tự) bị ép nhầm thành "3 Càng".
            // Dùng CẢ CHUỖI (không chỉ firstToken) vì mapBetType tự bỏ
            // khoảng trắng — cần vậy để bắt được cụm 2 từ như "chẵn chẵn"/
            // "lẻ lẻ"/"12 con giáp" (nếu chỉ đưa "chẵn" hay "12" riêng thì
            // không khớp được từ khóa ghép).
            const detectedType = mapBetType(trimmed);
            if (detectedType !== 'bl') {
                manualRows[index].type = detectedType;
            } else if (/^\d{2}$/.test(firstToken)) {
                manualRows[index].type = '2c';
            } else if (/^\d{3}$/.test(firstToken)) {
                manualRows[index].type = '3c';
            }
        }
        const selectElem = document.querySelectorAll('#smart-manual-rows tr')[index]?.querySelectorAll('select')[0];
        // Quy qua mã hiển thị (getManualTypeKey) trước khi gán vào <select> —
        // mã viết tắt trùng công thức ('5c'/'12d'/'13d') không còn là 1 lựa
        // chọn riêng trong danh sách nữa (đã gộp), gán thẳng mã thô sẽ không
        // khớp option nào, làm dropdown mất lựa chọn đang chọn.
        const displayType = getDropdownDisplayType(manualRows[index].type);
        if (selectElem && selectElem.value !== displayType) selectElem.value = displayType;
    }

    calculateSmartTotals();
}

function handleSmartKeyDown(e, index) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (index === manualRows.length - 1) {
            addSmartRow();
            setTimeout(() => {
                const nextInput = document.getElementById(`smart-input-${index + 1}`);
                if (nextInput) nextInput.focus();
            }, 50);
        }
    }
}

function calculateSmartTotals() {
    const checkedStationsCount = document.querySelectorAll('.smart-station-cb:checked').length || 1;
    const smartRegion = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const smartIsMB = smartRegion === 'MB';
    let grandTotal = 0;

    manualRows.forEach((row, index) => {
        const parsedNums = expandNumbers(row.num);
        let unitCount, soLo;

        if (row.type === 'da' || row.type === 'dx' || row.type === 'dv') {
            // BET_TYPES['da'/'dx'/'dv'].prizes để 0 (chưa từng gán) — số lô
            // thật của đá được tính riêng trong calculateItemFinancials
            // (36/54 lô), nên ở đây phải khớp y hệt, không lấy từ
            // getPrizeCount() (luôn ra 0).
            // Đá thẳng = đúng 1 cặp. Đá chéo/xiên = CẢ NHÓM là 1 cược duy
            // nhất (unitCount luôn = 1, không nhân theo số lượng con số).
            // Đá Vòng/Liên Hoàn = MỌI cặp đôi có thể có trong nhóm (C(n,2)).
            const uniqueNums = [...new Set(parsedNums)];
            if (row.type === 'da') {
                unitCount = uniqueNums.length >= 2 ? 1 : 0;
            } else if (row.type === 'dx') {
                unitCount = uniqueNums.length >= 2 ? 1 : 0;
            } else {
                unitCount = uniqueNums.length >= 3 ? uniqueNums.length * (uniqueNums.length - 1) / 2 : 0;
            }
            soLo = smartIsMB ? 54 : 36;
        } else {
            unitCount = parsedNums.length || 0;
            soLo = getPrizeCount(row.type, smartRegion);
        }

        const totalCost = (Number(row.price) || 0) * 1000 * soLo * checkedStationsCount * unitCount;
        if (row.num.trim() !== '') grandTotal += totalCost;

        const cellCost = document.getElementById(`smart-cost-${index}`);
        if (cellCost) cellCost.innerText = (row.num.trim() !== '' ? totalCost.toLocaleString() : 0) + ' ₫';
    });

    const totalDisplay = document.getElementById('smart-manual-total-cost');
    if (totalDisplay) totalDisplay.innerText = grandTotal.toLocaleString();
}

function toggleAllSmartRows(checked) {
    document.querySelectorAll('.smart-row-check').forEach(box => {
        box.checked = checked;
    });
    calculateSmartTotals();
}

function getSmartRowAllowedDigits(type, region) {
    const isMB = region === 'MB';
    if (['g8', 'duoi', 'c2'].includes(type)) return [2];
    // "dau"/"dau_db" luôn quy về đúng 2 chữ số (dau = tier 2 chữ số của
    // miền đó — G7 ở Bắc, G8 ở Trung/Nam; dau_db = lấy 2 số đầu của chính
    // số ĐB) — không đổi theo miền. Riêng "g7" gõ ĐÍCH DANH giải 7 mới thật
    // sự đổi theo miền: Bắc Giải 7 chỉ có 2 chữ số, Trung/Nam Giải 7 chỉ có
    // 3 chữ số — KHÔNG được gộp chung [2,3] như trước (gõ số 2 chữ số cho
    // Giải 7 ở Trung/Nam là sai, phải báo lỗi, không được chấp nhận).
    if (['dau', 'dau_db'].includes(type)) return [2];
    if (type === 'g7') return isMB ? [2] : [3];
    if (['3c', 'c3', 'g6', 'g5', 'g4', 'g3', 'g2', 'g1', 'g6g3', 'g6g4', 'g4g3', 'g6g4g3'].includes(type)) return [3];
    if (['4c', '5c', 'g3g2g1db', '10c', '10cuoi'].includes(type)) return [2, 3, 4];
    // "12 Đầu" = G7+G6+G5+G4 — không có Giải 8 (chỉ 2 chữ số) nên CHỈ nhận 3 càng.
    if (['12d', 'g7g6g5g4'].includes(type)) return [3];
    // "13 Đầu" = G8+G7+G6+G5+G4 — có Giải 8 (2 chữ số) nên CHỈ nhận 2 càng.
    if (['13d', 'g8g7g6g5g4'].includes(type)) return [2];
    // "5 Đầu" (G7+G6+G5, không có G8) → chỉ 3 càng, giống "12 Đầu".
    if (type === 'g7g6g5') return [3];
    // "6 Đầu" (G8+G7+G6+G5, có G8) → chỉ 2 càng, giống "13 Đầu".
    if (type === 'g8g7g6g5') return [2];
    // "12 Cuối"/"14 Cuối" đều gộp cả Giải 4 (5 chữ số) — cho phép cả 2/3
    // càng như "Cuối GĐB" thường (khách quen gõ 2 hoặc 3 số cuối tùy ý).
    if (['g4g3g2g1db', '14cuoi'].includes(type)) return [2, 3];
    return [2];
}

function allocateSmartManualTotal() {
    const totalK = Number(document.getElementById('smart-manual-total-input')?.value) || 0;
    if (totalK <= 0) return showToast('Nhập tổng tiền cần chia lớn hơn 0', 'error');

    const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const stationCount = document.querySelectorAll('.smart-station-cb:checked').length || 1;
    const selectedRows = manualRows
        .map((row, index) => ({ row, index, nums: expandNumbers(row.num) }))
        .filter(entry => document.querySelector(`.smart-row-check[data-index="${entry.index}"]`)?.checked && entry.nums.length);
    const totalUnits = selectedRows.reduce((sum, entry) => sum + entry.nums.length, 0);
    if (!totalUnits) return showToast('Hãy tick dòng số cần chia tổng tiền', 'error');

    selectedRows.forEach(({ row }) => {
        row.price = totalK / totalUnits;
    });
    renderSmartRows();
    showToast(`Đã chia đều ${totalK}k cho ${totalUnits} đơn vị cược`, 'success');
}

function addSmartRow() {
    const lastRow = manualRows[manualRows.length - 1];
    manualRows.push({ num: '', type: lastRow ? lastRow.type : 'bl', price: lastRow ? lastRow.price : 5 });
    renderSmartRows();
    setTimeout(() => document.getElementById(`smart-input-${manualRows.length - 1}`)?.focus(), 0);
}

function removeSmartRow(index) {
    manualRows.splice(index, 1);
    if (manualRows.length === 0) manualRows = [{ num: '', type: 'bl', price: 5 }];
    renderSmartRows();
}

function confirmSmartManual() {
    const selectedStations = Array.from(document.querySelectorAll('.smart-station-cb:checked')).map(cb => cb.value);
    if (selectedStations.length === 0) {
        if (typeof showToast === 'function') showToast("Vui lòng chọn ít nhất 1 đài!", "error");
        return;
    }

    const validRows = manualRows.filter(r => r.num.trim() !== '');
    if (validRows.length === 0) {
        if (typeof showToast === 'function') showToast("Vui lòng nhập ít nhất 1 dòng số!", "error");
        return;
    }

    const smartRegion = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const invalidRow = validRows.find(row => {
        const nums = expandNumbers(row.num);
        const allowedDigits = getSmartRowAllowedDigits(getManualTypeKey(row.type), smartRegion);
        if (nums.some(num => !allowedDigits.includes(num.length))) return true;
        if (row.type === 'da' && nums.length !== 2) return true;
        if (row.type === 'dx' && nums.length < 3) return true;
        if (row.type === 'dv' && nums.length < 2) return true;
        return false;
    });
    if (invalidRow) {
        return showToast('Sai loại cược: số 3 chữ số cần chọn Giải hoặc 3 Càng; số 2 chữ số không chọn 3 Càng/Giải.', 'error');
    }

    if (!appData[activeGroup]) appData[activeGroup] = { betList: [], inputHistory: [] };
    if (!appData[activeGroup].inputHistory) appData[activeGroup].inputHistory = [];

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} - ${now.toLocaleDateString('vi-VN')}`;

    const newSessionItems = [];

    validRows.forEach(row => {
        const parsedNums = expandNumbers(row.num);
        const betType = getManualTypeKey(row.type);
        if (betType === 'da' || betType === 'dx') {
            const uniqueNums = [...new Set(parsedNums)];
            if (uniqueNums.length < 2) return;
            // Đá thẳng = đúng 1 cặp. Đá chéo/xiên = CẢ NHÓM là MỘT cược duy
            // nhất (trúng khi TẤT CẢ số trong nhóm đều về, thiếu 1 số là thua
            // cả cụm) — khác với Đá Vòng bên dưới (tách cặp độc lập).
            const group = betType === 'da' ? uniqueNums.slice(0, 2) : uniqueNums;
            newSessionItems.push({
                ...createItem(group.join('-'), Number(row.price) || 0, document.querySelector('input[name="region-select"]:checked')?.value || 'MT', betType, betType.toUpperCase()),
                stations: selectedStations,
                pairNums: group
            });
            return;
        }
        if (betType === 'dv') {
            // Đá Chéo/Vòng/Liên Hoàn: tách nhóm số thành TỪNG CẶP đôi độc
            // lập (C(n,2) cặp), mỗi cặp tự ăn/thua riêng — trúng 1 phần vẫn
            // có tiền, khác hẳn Đá Xiên (cả nhóm phải về đủ mới ăn).
            const uniqueNums = [...new Set(parsedNums)];
            if (uniqueNums.length < 2) return;
            const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
            // Chỉ đúng 2 số thì "chéo/vòng" cũng ra được 1 cặp duy nhất —
            // thực chất là "Đá Thẳng", chỉ đổi lại đúng TÊN loại.
            if (uniqueNums.length < 3) {
                const group = uniqueNums.slice(0, 2);
                newSessionItems.push({
                    ...createItem(group.join('-'), Number(row.price) || 0, region, 'da', 'DA'),
                    stations: selectedStations,
                    pairNums: group
                });
                return;
            }
            const pairs = uniqueNums.flatMap((first, index) => uniqueNums.slice(index + 1).map(second => [first, second]));
            pairs.forEach(pair => {
                newSessionItems.push({
                    ...createItem(pair.join('-'), Number(row.price) || 0, region, betType, betType.toUpperCase()),
                    stations: selectedStations,
                    pairNums: pair
                });
            });
            return;
        }
        parsedNums.forEach(numStr => {
            newSessionItems.push({
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                num: numStr,
                betType,
                // "g{giải}lo{số}" chọn tay từ dropdown mới (VD "Giải 5 - Lô
                // 3") cần ghi chú rõ ngay — nhánh này vốn không có field note,
                // để trống thì nhìn lại Bảng Chi Tiết chỉ thấy mã thô, dễ lẫn
                // với các dòng "Giải 5" bao trọn (không giới hạn vị trí).
                note: /^g[1-8]lo\d+$/.test(String(betType || '')) ? describeTierOnly([betType]) : '',
                originalAmount: Number(row.price) || 0,
                amount: (Number(row.price) || 0) * 1000,
                stations: selectedStations,
                digits: numStr.length,
                region: document.querySelector('input[name="region-select"]:checked')?.value || 'MT',
                createdAt: timeStr,
                createdAtTimestamp: Date.now(),
                matched: false,
                winAmount: 0
            });
        });
    });

    appData[activeGroup].inputHistory.push({
        time: timeStr,
        items: newSessionItems
    });

    if (!appData[activeGroup].betList) appData[activeGroup].betList = [];
    appData[activeGroup].betList.push(...newSessionItems);

    closeSmartManualModal();
    renderMatrixTable();
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();
    if (typeof showToast === 'function') showToast("Đã thêm lượt nhập thành công!", "success");
}

// 1. Đổi thể loại cược trực tiếp (Đồng bộ betList + Save DB)
function changeItemBetType(sessionIdx, itemIdx, newType) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory[sessionIdx] || !gObj.inputHistory[sessionIdx].items[itemIdx]) return;

    const item = gObj.inputHistory[sessionIdx].items[itemIdx];
    const oldType = item.betType;
    // Ghi chú (Ghi chú) đang đúng bằng TÊN LOẠI CŨ tự sinh (chưa bị gõ tay
    // sửa thành nội dung khác, VD "Hợi (Heo)" hay note tự thêm) thì cập nhật
    // luôn theo tên loại MỚI — đổi loại mà ghi chú vẫn nói loại cũ (VD đổi
    // "4c" ("4 Cuối") sang "db" mà ghi chú vẫn còn "4 Cuối") là sai lệch, dễ
    // đối chiếu nhầm. Ghi chú nào đã KHÁC tên tự sinh (đã gõ tay/có nguồn gốc
    // riêng) thì GIỮ NGUYÊN, không đụng vào.
    if (typeof getRegionAwareTypeName === 'function' && item.note === getRegionAwareTypeName(oldType, item.region)) {
        item.note = getRegionAwareTypeName(newType, item.region);
    }
    item.betType = newType;
    // Tự tay chọn loại khác trong dropdown = MUỐN tính đúng theo loại đó
    // (bao lô/2C/3C/Đặc Biệt...) — phải bỏ giới hạn tierOnly cũ (VD "chỉ
    // Giải 4 Lô 6" từ lúc gõ tự động), không thì tiền vẫn tính theo giới hạn
    // cũ dù đã đổi loại, và nhãn "🎯 Giải..." cũng không biến mất.
    item.tierOnly = '';

    // Cập nhật đồng bộ sang betList
    if (gObj.betList) {
        const mainItem = gObj.betList.find(b => b.id === item.id);
        if (mainItem) {
            mainItem.betType = newType;
            mainItem.tierOnly = '';
            mainItem.note = item.note;
        }
    }

    // Cảnh báo nhẹ nếu chọn loại 2C/3C/Càng riêng không khớp độ dài số thật
    // (VD số 2 chữ số mà chọn "Bao Lô 3C") — không chặn, chỉ báo cho biết.
    const digitOnlyTypes = { '2c': 2, 'c2': 2, '3c': 3, 'c3': 3 };
    const expectedDigits = digitOnlyTypes[String(newType).toLowerCase()];
    const actualDigits = String(item.num || '').split('-')[0].length;
    if (expectedDigits && actualDigits && expectedDigits !== actualDigits) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ Số "${item.num}" có ${actualDigits} chữ số nhưng loại vừa chọn là ${expectedDigits} càng — kiểm tra lại kẻo tính sai`, 'error');
        }
    }

    if (typeof recalculateTotals === 'function') recalculateTotals(activeGroup);
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

    // Vá riêng đúng lượt nhập vừa đổi thay vì xóa-dựng lại toàn bảng: trước
    // đây gọi renderMatrixTable() KHÔNG truyền trang → luôn nhảy về trang 1
    // (mất vị trí đang xem) + toàn bộ bảng bị xóa-dựng lại gây giật/nhấp
    // nháy dù chỉ đổi 1 dòng.
    renderMatrixTable(currentMatrixPage, sessionIdx);
    if (typeof showToast === 'function') showToast('Đã cập nhật thể loại cược!', 'success');
}

// 2. Xóa 1 số lẻ trong dòng (Đồng bộ betList + Save DB)
function deleteItemFromSession(sessionIdx, itemIdx) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory[sessionIdx]) return;

    const itemObj = gObj.inputHistory[sessionIdx].items[itemIdx];
    if (itemObj) {
        // Xóa khỏi betList
        if (gObj.betList) {
            gObj.betList = gObj.betList.filter(i => i.id !== itemObj.id);
        }
        // Xóa khỏi inputHistory
        gObj.inputHistory[sessionIdx].items.splice(itemIdx, 1);
        if (gObj.inputHistory[sessionIdx].items.length === 0) {
            gObj.inputHistory.splice(sessionIdx, 1);
        }
    }

    if (typeof recalculateTotals === 'function') recalculateTotals(activeGroup);
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

    renderMatrixTable();
    if (typeof showToast === 'function') showToast('Đã xóa dòng chọn', 'success');
}

// 3. Xóa các dòng được tick Checkbox (Hàm mới - Đồng bộ cả 2 mảng)
function deleteSelectedItems() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkboxes.length === 0) {
        if (typeof showToast === 'function') showToast('Bạn chưa chọn dòng nào để xóa!', 'error');
        return;
    }

    const gObj = appData[activeGroup];
    if (!gObj) return;

    const idsToRemove = new Set();
    const targets = {};

    checkboxes.forEach(cb => {
        const sIdx = parseInt(cb.dataset.session);
        const iIdx = parseInt(cb.dataset.item);
        
        const item = gObj.inputHistory[sIdx]?.items[iIdx];
        if (item && item.id) idsToRemove.add(item.id);

        if (!targets[sIdx]) targets[sIdx] = [];
        targets[sIdx].push(iIdx);
    });

    // Xóa trong inputHistory từ chỉ số lớn về nhỏ
    Object.keys(targets).forEach(sIdx => {
        targets[sIdx].sort((a, b) => b - a).forEach(iIdx => {
            gObj.inputHistory[sIdx].items.splice(iIdx, 1);
        });
    });

    gObj.inputHistory = gObj.inputHistory.filter(s => s.items && s.items.length > 0);

    // Xóa đồng bộ trong betList
    if (gObj.betList && idsToRemove.size > 0) {
        gObj.betList = gObj.betList.filter(b => !idsToRemove.has(b.id));
    }

    if (typeof recalculateTotals === 'function') recalculateTotals(activeGroup);
    if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

    renderMatrixTable();
    if (typeof showToast === 'function') showToast(`Đã xóa ${checkboxes.length} dòng được chọn`, 'success');
}

// 4. Xóa toàn bộ lượt nhập / tin nhắn (Giữ xác nhận Confirm + Đồng bộ betList)
function deleteSession(sessionIdx) {
    const gObj = appData[activeGroup];
    if (!gObj || !gObj.inputHistory[sessionIdx]) return;

    // QUAN TRỌNG: bản này trước đây bị MẤT bước xác nhận (xóa ngay lập tức
    // khi bấm "Xóa Tin", không hỏi lại) — dù đúng ra phải giữ, xem comment
    // gốc phía trên hàm này. Xóa nguyên 1 lượt nhập là hành động khó/không
    // thể hoàn tác, luôn phải hỏi lại trước.
    showModal({
        title: '⚠️ Xác Nhận Xóa Lượt Nhập',
        body: `Bạn có chắc chắn muốn xóa <b style="color:#ff4d4d;">Lượt nhập #${sessionIdx + 1}</b>?<br><span style="color:#f87171; font-size:12.5px;">Toàn bộ số cược trong lượt này sẽ mất vĩnh viễn.</span>`,
        confirmText: 'Xóa Ngay',
        confirmClass: 'btn-red',
        cancelText: 'Hủy Bỏ',
        showCancel: true,
        onConfirm: () => {
            const session = gObj.inputHistory[sessionIdx];
            if (session && session.items && gObj.betList) {
                const idsToRemove = new Set(session.items.map(i => i.id));
                gObj.betList = gObj.betList.filter(item => !idsToRemove.has(item.id));
            }

            gObj.inputHistory.splice(sessionIdx, 1);

            if (typeof recalculateTotals === 'function') recalculateTotals(activeGroup);
            if (typeof saveAppDataToDB === 'function') saveAppDataToDB();

            renderMatrixTable();
            if (typeof showToast === 'function') showToast('Đã xóa lượt nhập!', 'success');
        }
    });
}

// ================= 2. HÀM RENDER BẢNG MA TRẬN TÍNH VỐN CHUẨN + PHÂN TRANG =================
let currentMatrixPage = 1;
// Tăng mỗi lần renderMatrixTable() được gọi mới, để đợt vẽ nền (chunk) của
// lần gọi CŨ tự biết dừng lại nếu người dùng đã đổi nhóm/trang/sửa dữ liệu
// trước khi nó vẽ xong — tránh vẽ nhầm dữ liệu cũ đè lên bảng mới.
let matrixRenderGeneration = 0;
const ITEMS_PER_PAGE = 30;

function renderMatrixTable(page = 1, targetSessionIdx = null) {
    const tbody = document.getElementById('excel-matrix-body');
    if (!tbody) return;

    const gObj = appData?.[activeGroup];

    // "Vá riêng 1 lượt nhập" — dùng khi chỉ 1 dòng của 1 lượt nhập vừa đổi
    // (đổi thể loại cược, sửa giá/ghi chú...), để khỏi phải xóa-dựng lại
    // TOÀN BỘ bảng như trước đây (gây giật/nhấp nháy cả trang, và còn có
    // thể nhảy về trang 1 nếu người gọi quên truyền đúng trang hiện tại).
    // Chỉ vá khi dòng của lượt nhập đó đang THẬT SỰ có sẵn trên DOM (đúng
    // trang đang xem, không bị lọc ẩn) — nếu không tìm thấy thì bỏ qua,
    // rơi xuống render đầy đủ như bình thường bên dưới (an toàn, không mất
    // dữ liệu hiển thị).
    if (targetSessionIdx !== null && targetSessionIdx !== undefined && gObj) {
        const oldRows = tbody.querySelectorAll(`tr[data-session-key="${targetSessionIdx}"]`);
        const session = gObj.inputHistory?.[targetSessionIdx];
        if (oldRows.length && session) {
            const betItemsByIdLocal = new Map((gObj.betList || []).map(item => [item.id, item]));
            const items = Array.isArray(session.items)
                ? session.items.map(item => betItemsByIdLocal.get(item.id) || item)
                : [];
            const hasFilterLocal = hasActiveDetailFilter();
            const visibleItems = [];
            items.forEach((item, itemIdx) => {
                if (!hasFilterLocal || detailItemMatches(item, session)) visibleItems.push({ item, itemIdx });
            });
            const entry = { realSessionIdx: targetSessionIdx, session, items, visibleItems };
            const newFragment = buildSessionFragment(entry);
            tbody.insertBefore(newFragment, oldRows[0]);
            oldRows.forEach(row => row.remove());
            if (typeof updateDetailTotals === 'function') updateDetailTotals();
            if (typeof updateGrandSummary === 'function') updateGrandSummary();
            return;
        }
    }

    // Dựng lại danh sách Miền/Đài trong ô lọc CHỈ ở nhánh render ĐẦY ĐỦ này
    // (không đụng ở nhánh "vá riêng 1 lượt nhập" phía trên) — đổi thể loại
    // cược/sửa giá không bao giờ làm xuất hiện/mất đài hay miền nào, quét lại
    // mỗi lần đó là phí công vô ích, với dữ liệu lớn (hàng trăm nghìn dòng)
    // sẽ tái tạo đúng cái lag/giật đã mất công khắc phục trước đây.
    if (typeof populateDetailFilterPanel === 'function') populateDetailFilterPanel();
    if (typeof updateDetailFilterButtonLabel === 'function') updateDetailFilterButtonLabel();

    const myRenderGeneration = ++matrixRenderGeneration;
    currentMatrixPage = page;
    if (typeof renderGroupButtons === 'function') renderGroupButtons();

    if (!gObj || !Array.isArray(gObj.inputHistory) || gObj.inputHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#64748b;padding:30px;">Chưa có dữ liệu nhập</td></tr>`;
        if (typeof updateDetailTotals === 'function') updateDetailTotals();
        if (typeof updateGrandSummary === 'function') updateGrandSummary();
        return;
    }

    const totalSessionsRaw = gObj.inputHistory.length;
    // Map chỉ build 1 lần cho cả lần render, không build lại theo từng lượt nhập.
    const betItemsById = new Map((gObj.betList || []).map(item => [item.id, item]));
    const hasFilter = hasActiveDetailFilter();

    // sessionEntries: { realSessionIdx, session, items, visibleItems }
    let sessionEntries;
    let totalSessions;
    let totalFilteredItems = 0;

    if (hasFilter) {
        // Có tìm kiếm/lọc trúng-trượt: bắt buộc quét toàn bộ lịch sử để không bỏ sót
        // kết quả ở các trang cũ, nhưng CHỈ lọc (không tính tiền, không dựng DOM) —
        // phần nặng (calculateItemFinancials + innerHTML) chỉ chạy cho đúng 1 trang
        // bên dưới, nên vẫn giữ được phân trang dù dữ liệu lên tới hàng triệu dòng.
        sessionEntries = [];
        for (let i = totalSessionsRaw - 1; i >= 0; i--) {
            const session = gObj.inputHistory[i];
            const items = Array.isArray(session.items)
                ? session.items.map(item => betItemsById.get(item.id) || item)
                : [];
            const visibleItems = [];
            for (let j = 0; j < items.length; j++) {
                if (detailItemMatches(items[j], session)) visibleItems.push({ item: items[j], itemIdx: j });
            }
            if (visibleItems.length) {
                sessionEntries.push({ realSessionIdx: i, session, items, visibleItems });
                totalFilteredItems += visibleItems.length;
            }
        }
        totalSessions = sessionEntries.length;
    } else {
        totalSessions = totalSessionsRaw;
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalSessions);
        // QUAN TRỌNG: phải tính "realSessionIdx" (= chỉ số THẬT trong mảng
        // inputHistory, dùng để sửa/xóa đúng dòng) bằng cách LẤY THẲNG
        // gObj.inputHistory[realSessionIdx] — không được làm kiểu "cắt 1
        // đoạn (slice) rồi đảo (reverse) đoạn đó" như bản cũ, vì "cắt trước
        // rồi đảo" và "đảo cả mảng rồi cắt" ra 2 kết quả KHÁC HẲN NHAU khi
        // có từ trang 2 trở đi (chỉ trùng nhau ở trang 1 khi có đúng 1
        // trang) — bản cũ vẫn tính nhãn realSessionIdx theo kiểu "đảo cả
        // mảng rồi cắt" trong khi DỮ LIỆU hiển thị lại lấy theo kiểu "cắt
        // rồi đảo", nên từ trang 2 trở đi bảng hiển thị/sửa NHẦM SANG lượt
        // nhập khác hẳn (đúng thứ cảm giác "giật/lộn xộn" khi có nhiều hơn
        // 1 trang lượt nhập). Cách tính dưới đây giống hệt nhánh có lọc ở
        // trên (đã tính đúng), chỉ khác là chạy theo đúng cửa sổ 1 trang.
        sessionEntries = [];
        for (let i = startIndex; i < endIndex; i++) {
            const realSessionIdx = totalSessions - 1 - i;
            const session = gObj.inputHistory[realSessionIdx];
            const items = Array.isArray(session.items)
                ? session.items.map(item => betItemsById.get(item.id) || item)
                : [];
            const visibleItems = items.map((item, itemIdx) => ({ item, itemIdx }));
            sessionEntries.push({ realSessionIdx, session, items, visibleItems });
        }
    }

    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const pagedSessions = hasFilter
        ? sessionEntries.slice(startIndex, startIndex + ITEMS_PER_PAGE)
        : sessionEntries;

    // Tối ưu hiệu năng DOM bằng DocumentFragment
    // Dựng bảng cho ĐÚNG 1 lượt nhập, trả về 1 fragment — tách hàm riêng để
    // có thể vẽ NGAY một đợt đầu và vẽ dần phần còn lại trong nền (xem bên
    // dưới), thay vì dựng hết hàng trăm/nghìn dòng cùng lúc làm đứng máy.
    // Khai báo kiểu "function" (không phải const/arrow) để được hoisting lên
    // đầu scope renderMatrixTable — cho phép nhánh "vá riêng 1 lượt nhập" ở
    // đầu hàm gọi được nó dù đứng TRƯỚC vị trí khai báo trong code.
    function buildSessionFragment(entry) {
        const localFragment = document.createDocumentFragment();
        const { realSessionIdx, session, items, visibleItems } = entry;
        if (visibleItems.length === 0) return localFragment;

        // Đếm số dòng theo từng linkId trong lượt nhập này để tô CÙNG 1 màu
        // nhạt cho các dòng thuộc chung 1 cụm (VD 25 số Lẻ Lẻ, 100 số Con
        // Giáp, các cặp Đá Vòng) — nhìn phát biết ngay "đây là 1 lần đánh",
        // đỡ rối khi số dòng nở ra nhiều. Bỏ qua nếu chỉ 1 dòng (bet thường).
        const linkIdCounts = {};
        visibleItems.forEach(({ item }) => {
            if (item.linkId) linkIdCounts[item.linkId] = (linkIdCounts[item.linkId] || 0) + 1;
        });
        const linkIdGroupIndex = {};
        let nextGroupTintIndex = 0;

        let sessionTotalBet = 0;
        let sessionTotalWin = 0;
        const sessionRegion = session.region || items[0]?.region || 'MT';

        for (let k = 0; k < visibleItems.length; k++) {
            const financials = calculateItemFinancials(visibleItems[k].item, sessionRegion);
            sessionTotalBet += financials.totalItemCost;
            sessionTotalWin += financials.winAmount;
        }

        // "Thành tiền" luôn tính theo góc nhìn NHÀ CÁI: Vốn thu - Tiền trả thưởng.
        // Dương (+) = nhà cái LÃI → xanh. Âm (-) = nhà cái LỖ (khách trúng vượt vốn) → đỏ.
        const sessionNet = sessionTotalBet - sessionTotalWin;
        const stationsStr = items[0]?.stations?.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join(', ') || 'Chưa chọn';
        const regionTag = items[0]?.region || sessionRegion;
        const sessionNetColor = sessionNet >= 0 ? '#00ff88' : '#ff4d4d';
        // Màu riêng theo miền cho thanh ngang mỗi lượt nhập — 1 nhóm trong 1
        // ngày thường có RẤT NHIỀU tin xen kẽ đủ 3 miền, nhìn cột "Đài" từng
        // dòng để phân biệt miền nào khá chậm. Nhìn MÀU thanh ngang (viền +
        // chữ "Lượt nhập #...") thì phân biệt tức thì, không cần đọc chữ.
        const regionHeaderColor = REGION_HEADER_COLOR[regionTag] || REGION_HEADER_COLOR.MT;

        // --- Row Header Lượt nhập ---
        const trHeader = document.createElement('tr');
        trHeader.dataset.sessionKey = String(realSessionIdx);
        trHeader.style.cssText = `background:#1e293b; border-top:2px solid ${regionHeaderColor};`;
        trHeader.innerHTML = `
            <td colspan="3" style="padding:8px 12px; font-weight:bold; color:${regionHeaderColor};">
                📩 Lượt nhập #${realSessionIdx + 1}
                <span style="display:block; color:#94a3b8; font-size:11px; font-weight:normal; margin-top:2px;">${session.time || ''}</span>
            </td>
            <td colspan="3" style="padding:8px; color:#fbbf24; font-size:12px;">
                Đài: <b>${stationsStr}</b> (${items[0]?.stations?.length || 1} đài)
            </td>
            <td colspan="3" style="padding:8px; color:#38bdf8; text-align:right; font-size:12px;">
                Vốn tin này: <b>${sessionTotalBet.toLocaleString()} ₫</b>
            </td>
            <td colspan="3" style="padding:8px; text-align:right; font-size:12px; color:${sessionNetColor}; font-weight:bold;">
                Thành tiền: ${sessionNet >= 0 ? '+' : ''}${sessionNet.toLocaleString()} ₫
            </td>
            <td style="text-align:center; padding:4px;">
                <button class="btn btn-sm btn-red" style="padding:2px 8px; font-size:11px;" onclick="deleteSession(${realSessionIdx})">Xóa Tin</button>
            </td>
        `;
        localFragment.appendChild(trHeader);

        // --- Row Chi tiết từng con số ---
        for (let displayIdx = 0; displayIdx < visibleItems.length; displayIdx++) {
            const itemIdx = visibleItems[displayIdx].itemIdx;
            const item = visibleItems[displayIdx].item;
            const financials = calculateItemFinancials(item, sessionRegion);
            const totalItemCost = financials.totalItemCost;
            const winVal = financials.winAmount;
            // Góc nhìn NHÀ CÁI: Vốn thu - Tiền trả thưởng. Dương (+) = nhà cái LÃI → xanh.
            // Âm (-) = nhà cái LỖ (khách trúng vượt vốn dòng này) → đỏ.
            const netVal = totalItemCost - winVal;

            const itemOrigK = item.originalAmount || (item.amount >= 1000 ? item.amount / 1000 : item.amount) || 1;
            const isHit = Boolean(item.matched);
            const numStyle = isHit ? 'color:#ff4d4d; font-weight:bold; font-size:15px;' : 'color:#00f3ff; font-size:14px;';
            // Số của Đá Chéo/Xiên/Vòng lưu dạng gộp dấu gạch (VD "23-42-35-54"),
            // dài hơn hẳn số 2-3 chữ số thường — ô nhập cố định 78-90px sẽ cắt
            // mất phần đuôi. Nới rộng ô theo đúng độ dài số khi có pairNums.
            const isGroupNum = Array.isArray(item.pairNums) && item.pairNums.length >= 2;
            const numFieldWidth = isGroupNum ? Math.max(90, String(item.num || '').length * 11 + 24) : 78;

            const itemBetType = BET_TYPES[item.betType] ? item.betType : mapBetType(item.betType);
            // Dùng CHUNG đúng 1 hàm getManualBetTypeOptions() với modal Nhập
            // Tay/Xem Lại — trước đây Bảng Chi Tiết tự liệt kê riêng bằng
            // Object.entries(BET_TYPES), nên khi thêm loại mới (VD 12 con
            // giáp riêng) mà quên cập nhật CẢ 2 chỗ thì 2 nơi lại ra 2 danh
            // sách khác nhau. getManualTypeKey() quy 'bl' (mã cũ/tự động) về
            // '2c' trước khi tra — khỏi bị "biến mất" khỏi danh sách vì 'bl'
            // không có trong nhóm nào (đã gộp chung với '2c' từ trước).
            const typeSelectOptions = getManualBetTypeOptions(getDropdownDisplayType(itemBetType), sessionRegion);
            // Hiện thêm 1 dòng nhỏ "🎯 ..." ngay trên dropdown cho biết ĐÚNG
            // giải cần dò — dù là do người dùng tự giới hạn (VD "Db+G7. Chan
            // chan x 35k" → "🎯 Đặc Biệt + Giải 7") hay do CHÍNH loại cược đó
            // vốn đã gộp cố định nhiều giải (VD "5 Cuối GĐB" → "🎯 Giải 3 +
            // Giải 2 + Giải 1 + Đặc Biệt") — khỏi phải thuộc lòng luật mới
            // biết bên trong 1 loại gồm những giải nào. Có title= để rê
            // chuột xem đủ khi tên dài không hiện hết trong ô nhỏ.
            const tierLabel = getDisplayTierBadge(item, sessionRegion);
            const tierBadge = tierLabel
                ? `<div style="color:#fbbf24; font-size:10px; font-weight:bold; margin-bottom:2px;" title="${escapeHtml(tierLabel)}">🎯 ${escapeHtml(tierLabel)}</div>`
                : '';

            const netDisplay = `<span style="color:${netVal >= 0 ? '#00ff88' : '#ff4d4d'}; font-weight:bold;">${netVal >= 0 ? '+' : ''}${netVal.toLocaleString()} ₫</span>`;

            const itemStations = (Array.isArray(item.stations) && item.stations.length > 0)
                ? item.stations.map(s => (typeof STATION_ABBR !== 'undefined' && STATION_ABBR[s]) ? STATION_ABBR[s] : s).join(', ')
                : 'Chưa chọn';

            let groupTint = '';
            if (!isHit && !item.edited && item.linkId && linkIdCounts[item.linkId] > 1) {
                if (!(item.linkId in linkIdGroupIndex)) linkIdGroupIndex[item.linkId] = nextGroupTintIndex++;
                groupTint = (linkIdGroupIndex[item.linkId] % 2 === 0)
                    ? 'background:rgba(56,189,248,0.07);'
                    : 'background:rgba(168,85,247,0.07);';
            }

            const trItem = document.createElement('tr');
            trItem.dataset.sessionKey = String(realSessionIdx);
            trItem.style.cssText = isHit
                ? 'background:rgba(255, 77, 77, 0.16); box-shadow: inset 3px 0 0 #ff4d4d;'
                : (item.edited ? 'background:rgba(250, 204, 21, 0.22);' : (groupTint || 'background:#0f172a;'));
            trItem.innerHTML = `
                <td style="text-align:center; color:#64748b; font-size:11px;">${displayIdx + 1}</td>
                <td style="text-align:center;">
                    <span style="display:block; font-size:11px; color:#38bdf8; font-weight:bold;">${itemStations}</span>
                    <span style="display:block; font-size:9px; color:#a855f7; font-weight:bold; margin-top:2px;">${item.region || regionTag}</span>
                </td>
                <td style="text-align:center;">
                    <input class="table-input number-input" type="text" inputmode="${isGroupNum ? 'text' : 'numeric'}" pattern="${isGroupNum ? '' : '[0-9]*'}" maxlength="${Math.max(3, (item.num || '').length)}"
                           style="${numStyle} ${isGroupNum ? `width:${numFieldWidth}px; min-width:${numFieldWidth}px; max-width:none;` : ''}"
                           value="${escapeHtml(item.num || '')}" aria-label="Số cược"
                           oninput="updateDetailItemNumber(${realSessionIdx}, ${itemIdx}, this.value)"
                           onchange="updateDetailItemNumber(${realSessionIdx}, ${itemIdx}, this.value, true)">
                </td>
                <td style="text-align:center; font-size:12px;">${item.num?.length === 2 ? '✓' : ''}</td>
                <td style="text-align:center; font-size:12px;">${item.num?.length === 3 ? '✓' : ''}</td>
                <td style="text-align:center; font-size:12px;">${['da','dx','dv'].includes(item.betType) ? '✓' : ''}</td>
                <td style="text-align:center; font-size:12px;">
                    ${tierBadge}
                    <select style="width:128px; max-width:128px; background:#1e293b; color:#f472b6; border:1px solid #334155; border-radius:4px; padding:2px; cursor:pointer; font-size:11px;"
                            onchange="changeItemBetType(${realSessionIdx}, ${itemIdx}, this.value)">
                        ${typeSelectOptions}
                    </select>
                </td>
                <td style="text-align:center; font-size:13px;">
                    <input class="table-input money-input" type="number" min="0" step="0.01" value="${escapeHtml(itemOrigK)}"
                           oninput="updateDetailItemFieldLive(${realSessionIdx}, ${itemIdx}, 'price', this.value)"
                           onchange="updateDetailItemField(${realSessionIdx}, ${itemIdx}, 'price', this.value)" aria-label="Giá tiền theo k">
                </td>
                <td style="text-align:center; font-size:13px; color:#fbbf24; font-weight:bold;">${totalItemCost.toLocaleString()} ₫</td>
                <td style="text-align:center; font-size:12px; color:${winVal > 0 ? '#ff4d4d' : '#64748b'}; font-weight:${winVal > 0 ? 'bold' : 'normal'};">
                    ${winVal > 0 ? winVal.toLocaleString() + ' ₫' : '—'}
                </td>
                <td style="text-align:center; font-size:12px;">${netDisplay}</td>
                <td style="text-align:left; min-width:150px;">
                    <input class="table-input note-input" type="text" value="${escapeHtml(item.note || '')}"
                           oninput="updateDetailItemFieldLive(${realSessionIdx}, ${itemIdx}, 'note', this.value)"
                           placeholder="Ghi chú..." onchange="updateDetailItemField(${realSessionIdx}, ${itemIdx}, 'note', this.value)">
                </td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-gray" style="padding:1px 6px; font-size:10px;" onclick="deleteItemFromSession(${realSessionIdx}, ${itemIdx})">✕</button>
                </td>
            `;
            localFragment.appendChild(trItem);
        }
        return localFragment;
    }

    // Vẽ NGAY 1 đợt đầu đủ dùng liền (giới hạn theo SỐ DÒNG thật, không phải
    // số lượt nhập — 1 lượt có thể chứa hàng trăm dòng như dàn Lẻ Lẻ/Con
    // Giáp), phần còn lại vẽ dần trong nền từng đợt nhỏ để không đứng máy dù
    // tổng số dòng rất lớn — người dùng ngồi đọc vài giây là dữ liệu còn lại
    // cũng đã vẽ xong, không cần chờ hay bấm gì thêm.
    const FIRST_PAINT_ROW_TARGET = 150;
    let splitIndex = pagedSessions.length;
    let runningRows = 0;
    for (let i = 0; i < pagedSessions.length; i++) {
        runningRows += pagedSessions[i].visibleItems.length;
        if (runningRows >= FIRST_PAINT_ROW_TARGET) { splitIndex = i + 1; break; }
    }
    const firstBatchSessions = pagedSessions.slice(0, splitIndex);
    const restSessions = pagedSessions.slice(splitIndex);

    const fragment = document.createDocumentFragment();
    firstBatchSessions.forEach(entry => fragment.appendChild(buildSessionFragment(entry)));

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    const searchCount = document.getElementById('detail-search-count');
    if (searchCount) {
        searchCount.textContent = hasFilter ? `${totalFilteredItems} kết quả` : `${(gObj.betList || []).length} số`;
    }

    // Cập nhật tổng số tiền & giao diện phụ trợ — tính trên TOÀN BỘ pagedSessions
    // (không chỉ đợt đầu) nên số liệu đúng ngay, dù phần dòng còn lại chưa
    // kịp vẽ xong ở dưới.
    if (typeof updateDetailTotals === 'function') updateDetailTotals();
    if (typeof updateGrandSummary === 'function') updateGrandSummary();
    if (typeof renderPaginationControls === 'function') {
        // Vẫn phân trang khi đang tìm/lọc — trang được tính trên tập đã lọc (sessionEntries).
        renderPaginationControls('matrix-pagination', totalSessions, page, ITEMS_PER_PAGE, 'renderMatrixTable');
    }

    // Phần còn lại (nếu 1 trang có quá nhiều dòng) vẽ dần trong nền — từng
    // đợt nhỏ, nhường luồng chính giữa các đợt để không đứng máy. Kiểm tra
    // matrixRenderGeneration mỗi đợt để tự dừng nếu đã có lần render mới hơn
    // (đổi nhóm/trang/sửa dữ liệu) — tránh vẽ chồng dữ liệu cũ lên bảng mới.
    if (restSessions.length) {
        const SESSIONS_PER_BACKGROUND_CHUNK = 5;
        (async () => {
            for (let i = 0; i < restSessions.length; i += SESSIONS_PER_BACKGROUND_CHUNK) {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (myRenderGeneration !== matrixRenderGeneration) return;
                const chunkFragment = document.createDocumentFragment();
                restSessions.slice(i, i + SESSIONS_PER_BACKGROUND_CHUNK).forEach(entry => {
                    chunkFragment.appendChild(buildSessionFragment(entry));
                });
                if (myRenderGeneration !== matrixRenderGeneration) return;
                tbody.appendChild(chunkFragment);
            }
        })();
    }
}

// ================= 1. HÀM TÍNH TOÁN TIỀN VỐN & TIỀN TRÚNG =================
function calculateItemFinancials(item, region = 'MT') {
    if (!item) return { totalItemCost: 0, winAmount: 0, soLo: 0 };

    const isMB = (region === 'MB' || region === 'Miền Bắc');
    const type = String(item.betType || '').toLowerCase().trim();

    let soLo = 18; // Mặc định MN/MT (2c/bao lô)

    // 0. Bị giới hạn chỉ 1 (hoặc vài) giải cụ thể (VD "Gnhat. Le le x 50k" →
    // tierOnly=['g1']; "Db+G7. Chan chan x 35k" → tierOnly=['db','g7']) → số
    // lô = đúng số giải được kết hợp (2 giải kết hợp = 2 lô, không phải 1),
    // dù betType gốc (lẻ lẻ/chẵn chẵn/con giáp...) vốn tính kiểu bao lô.
    if (Array.isArray(item.tierOnly) && item.tierOnly.length) {
        soLo = item.tierOnly.length;
    }
    // 1. Đá / Chéo / Xiên (Ưu tiên cao nhất)
    else if (['c2', 'c3'].includes(type)) {
        soLo = 1;
    } else if (['da', 'dx', 'dv', 'xien', 'cheo', 'dá'].includes(type)) {
        // Xác nhận Cocomi: "Đá là tính hết tất cả các lô" — số lô = (số lô
        // mỗi con, 18 MT/MN hoặc 27 Bắc) × SỐ CON trong nhóm. Đá Thẳng (da)
        // và từng cặp của Đá Chéo/Vòng (dv) luôn đúng 2 con/dòng nên vẫn ra
        // 36/54 như trước — chỉ Đá Xiên (dx, cả nhóm 3+ con là 1 cược) mới
        // thật sự tăng theo số con (VD 3 con Bắc = 3×27 = 81, KHÔNG phải
        // luôn cố định 54 như trước đây tính nhầm).
        const perNumberLo = isMB ? 27 : 18;
        const groupSize = (Array.isArray(item.pairNums) && item.pairNums.length >= 2) ? item.pairNums.length : 2;
        soLo = perNumberLo * groupSize;
    }
    // Xỉu chủ: MB 23 lô, MT/MN 17 lô.
    else if (type === 'xc') {
        soLo = isMB ? 23 : 17;
    }
    // Explicit prize/suffix types override the generic three-digit fallback.
    // "g4lo6" (đúng 1 vị trí trong 1 giải) không có mặt trong BET_TYPES nhưng
    // vẫn phải tính đúng 1 lô, không rơi xuống mặc định 17/18/27 phía dưới.
    else if (typeof getPrizeCount === 'function' && (BET_TYPES[type] || /^g[1-8]lo\d+$/.test(type))
        && !['bl', '2c', '3c'].includes(type)) {
        soLo = getPrizeCount(type, isMB ? 'MB' : (region === 'MN' ? 'MN' : 'MT'));
    }
    // 3 Càng and a bare 3-digit number.
    else if (item.digits === 3 || type === '3c' || item.num?.length === 3) {
        soLo = isMB ? 23 : 17;
    }
    // 4. Mặc định các loại khác (2 càng / Lô chuẩn)
    else {
        soLo = isMB ? 27 : 18;
    }

    const giaK = Number(item.originalAmount) || (item.amount >= 1000 ? item.amount / 1000 : item.amount) || 0;
    const soDai = (Array.isArray(item.stations) && item.stations.length > 0) ? item.stations.length : 1;
    const hitCount = Number(item.matchCount) || (item.matched ? 1 : 0);

    // Tính vốn: giá_k * số_lô * số_đài * 1000
    const totalItemCost = giaK * soLo * soDai * 1000;

    // Tính thưởng – LẤY TỪ CUSTOM_RATES (không cứng nữa)
    let winAmount = 0;
    if (hitCount > 0) {
        // Đã bỏ "4 Càng" (cược 4 chữ số, tỷ lệ riêng 8800 lần) theo đúng xác
        // nhận: hệ thống chỉ có 3 kiểu cược thật — 2C/3C/Đá — không có kiểu
        // số 4 chữ số nào cả. "4C" giờ là bí danh của "4/5 Cuối" (tổ hợp
        // nhiều giải, tính tiền vốn/thưởng y hệt bao lô bình thường qua
        // nhánh tierOnly/BET_TYPES ở trên, không cần tỷ lệ ăn riêng ở đây).
        const is3orDa = (
            item.digits === 3 ||
            item.num?.length === 3 ||
            ['da', 'dx', 'dv', 'xien', 'cheo', 'dá', '3c'].includes(type)
        );

        const tyLe = is3orDa
            ? (CUSTOM_RATES?.c3 || CUSTOM_RATES?.da || 780)
            : (CUSTOM_RATES?.c2 || 91);

        winAmount = giaK * tyLe * hitCount * soDai * 1000;
    }

    return {
        totalItemCost: Math.round(totalItemCost),
        winAmount: Math.round(winAmount),
        soLo: soLo
    };
}

// ================= THANH ĐIỀU HƯỚNG PHÂN TRANG =================
function renderPaginationControls(containerId, totalItems, currentPage, pageSize, callbackFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let phtml = `<div style="display:flex; justify-content:center; gap:6px; margin-top:10px; flex-wrap:wrap;">`;
    for (let p = 1; p <= totalPages; p++) {
        const activeStyle = p === currentPage 
            ? 'background:#00f3ff; color:#000; font-weight:bold;' 
            : 'background:#1e293b; color:#fff; border:1px solid #334155;';
        phtml += `<button class="btn btn-sm" style="${activeStyle} padding:3px 10px; border-radius:4px; cursor:pointer;" onclick="${callbackFnName}(${p})">${p}</button>`;
    }
    phtml += `</div>`;
    container.innerHTML = phtml;
}

// ================= QUẢN TRỊ RESET MẬT KHẨU =================
function adminResetOneUser() {
    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    if (typeof customPrompt === 'function') {
        customPrompt("Reset mật khẩu User", "Nhập tên User cần xóa...", "", (userName) => {
            if (!userName) return;
            if (typeof removeUserPattern === 'function') removeUserPattern(userName.trim());
            if (typeof showToast === 'function') showToast(`Đã xóa mật khẩu của "${userName}"`, "success");
            if (typeof initPatternCanvas === 'function') initPatternCanvas();
        });
    }
}

function adminResetAllUsers() {
    const overlay = document.getElementById('custom-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && typeof STORAGE_KEY_PATTERN !== 'undefined' && key.startsWith(STORAGE_KEY_PATTERN)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (typeof showToast === 'function') showToast(`Đã reset mật khẩu của ${keysToRemove.length} user!`, "success");
    if (typeof initPatternCanvas === 'function') initPatternCanvas();
}

/**
 * CHIA TIỀN THEO NGƯỜI HÙN VỐN
 * - Đỏ / −  → phải CHI
 * - Xanh / + → được HƯỞNG
 * - Thêm ô Tổng Lời/Lỗ gốc
 */
function calcCapitalShare() {
    const percentInput = document.getElementById('capital-percent');
    const baseSelect   = document.getElementById('capital-base');
    const percentDisp  = document.getElementById('cap-percent-display');
    const shareEl      = document.getElementById('capital-share-amount');
    const remainEl     = document.getElementById('capital-remain-amount');
    const baseEl       = document.getElementById('capital-base-amount');
    const shareLabel   = document.getElementById('cap-share-label');

    if (!percentInput || !baseSelect || !shareEl || !remainEl) return;

    const percent = Math.max(0, Math.min(100, parseFloat(percentInput.value) || 0));
    const baseType = baseSelect.value || 'activeNet';

    if (percentDisp) percentDisp.textContent = percent;

    let totalWinAll = 0;
    let totalBetAll = 0;
    let totalNetAll = 0;
    let activeWin   = 0;
    let activeNet   = 0;

    if (typeof groups !== 'undefined' && Array.isArray(groups)) {
        groups.forEach(g => {
            if (!appData[g]) return;

            if (typeof recalculateTotals === 'function') {
                recalculateTotals(g);
            }

            const t = appData[g].totals || {};
            const bet = Number(t.totalBet) || 0;
            const win = Number(t.totalWin) || 0;
            const net = bet - win; // nhà cái

            totalWinAll += win;
            totalBetAll += bet;
            totalNetAll += net;

            if (g === activeGroup) {
                activeWin = win;
                activeNet = net;
            }
        });
    }

    let baseAmount = 0;
    switch (baseType) {
        case 'activeNet': baseAmount = activeNet; break;
        // "Tổng trúng" là tiền nhà cái PHẢI TRẢ cho khách — luôn là khoản
        // LỖ/chi ra của nhà cái, không phải lời. Trước đây dùng thẳng
        // activeWin/totalWinAll (luôn >= 0) nên hễ có trúng là hiện màu
        // xanh "được hưởng", sai bản chất (trúng càng nhiều nhà cái càng
        // lỗ). Đảo dấu để luôn thể hiện đúng là khoản phải chi.
        case 'activeWin': baseAmount = -activeWin; break;
        case 'totalWin':  baseAmount = -totalWinAll; break;
        case 'totalBet':  baseAmount = totalBetAll; break;
        case 'net':       baseAmount = totalNetAll; break;
        default:          baseAmount = activeNet;
    }

    const share  = Math.round(baseAmount * (percent / 100));
    const remain = baseAmount - share;

    // ===== Ô Tổng Lời/Lỗ gốc =====
    if (baseEl) {
        baseEl.textContent = (baseAmount >= 0 ? '+' : '-') + Math.abs(baseAmount).toLocaleString() + ' ₫';
        baseEl.style.color = baseAmount >= 0 ? '#00ff88' : '#ff6b6b';
    }

    // ===== Ô Người hùn vốn =====
    if (shareLabel) {
        shareLabel.textContent = share >= 0 ? 'Người hùn được hưởng' : 'Người hùn phải chi';
    }
    shareEl.textContent = (share >= 0 ? '+' : '-') + Math.abs(share).toLocaleString() + ' ₫';
    shareEl.style.color = share >= 0 ? '#00ff88' : '#ff6b6b';

    // ===== Ô Phần còn lại =====
    remainEl.textContent = (remain >= 0 ? '+' : '-') + Math.abs(remain).toLocaleString() + ' ₫';
    remainEl.style.color = remain >= 0 ? '#e2e8f0' : '#ff6b6b';
}

/**
 * Xuất file chia tiền theo % người hùn vốn
 * - Không hiện "Phần còn lại" (chỉ nhà cái cần biết)
 * - Hiện đúng ngữ cảnh theo lựa chọn
 */
function exportCapitalShare() {
    // Chạy tính toán trước
    if (typeof calcCapitalShare === 'function') calcCapitalShare();

    const percent = parseFloat(document.getElementById('capital-percent')?.value) || 0;
    const baseType = document.getElementById('capital-base')?.value || 'activeNet';
    const shareText = document.getElementById('capital-share-amount')?.textContent || '0 ₫';
    const baseText = document.getElementById('capital-base-amount')?.textContent || '0 ₫';
    const shareLabel = document.getElementById('cap-share-label')?.textContent || 'Người hùn vốn';

    const baseNames = {
        activeNet: 'Lời / Lỗ của nhóm đang chọn',
        activeWin: 'Tổng trúng của nhóm đang chọn',
        totalWin:  'Tổng tiền trúng (toàn bộ nhóm)',
        totalBet:  'Tổng tiền cược (toàn bộ nhóm)',
        net:       'Tổng Lời / Lỗ (toàn bộ nhóm)'
    };
    const baseName = baseNames[baseType] || baseType;

    const now = new Date();
    const timeStr = now.toLocaleString('vi-VN');

    // ===== Xác định phạm vi =====
    const isAllGroups = ['net', 'totalWin', 'totalBet'].includes(baseType);
    const scopeText = isAllGroups
        ? 'Toàn bộ các nhóm'
        : `Nhóm ${activeGroup || 'A'}`;

    // ===== Chi tiết từng nhóm (chỉ khi chọn toàn bộ) =====
    let detailLines = '';
    if (isAllGroups && typeof groups !== 'undefined') {
        detailLines  = '\nCHI TIẾT TỪNG NHÓM:\n';
        detailLines += '───────────────────────────────────────\n';
        detailLines += 'Nhóm   |     Cược |     Trúng |    Lời/Lỗ\n';
        detailLines += '───────────────────────────────────────\n';

        groups.forEach(g => {
            if (!appData[g]) return;
            if (typeof recalculateTotals === 'function') recalculateTotals(g);

            const t = appData[g].totals || {};
            const bet = Number(t.totalBet) || 0;
            const win = Number(t.totalWin) || 0;
            const net = bet - win;

            const netStr = (net >= 0 ? '+' : '-') + Math.abs(net).toLocaleString();
            detailLines += `Nhóm ${String(g).padEnd(2)} | ${bet.toLocaleString().padStart(9)} | ${win.toLocaleString().padStart(9)} | ${netStr.padStart(10)}\n`;
        });
        detailLines += '───────────────────────────────────────\n';
    }

    const content = `
═══════════════════════════════════════
   BÁO CÁO CHIA TIỀN NGƯỜI HÙN VỐN
═══════════════════════════════════════

Thời gian xuất : ${timeStr}
Phạm vi tính   : ${scopeText}
Cơ sở tính     : ${baseName}
Phần trăm hùn  : ${percent}%

───────────────────────────────────────
Tổng Lời / Lỗ gốc :
${baseText}

${shareLabel} (${percent}%):
${shareText}
───────────────────────────────────────
${detailLines}
Ghi chú:
  • Dấu − = phải CHI
  • Dấu + = được HƯỞNG
  • Số liệu theo góc nhìn Nhà cái
═══════════════════════════════════════
`.trim();

    // Tạo file
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const fileName = isAllGroups
        ? `ChiaTien_HunVon_ToanBo_${percent}%.txt`
        : `ChiaTien_HunVon_Nhom${activeGroup || 'A'}_${percent}%.txt`;

    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast('Đã xuất file chia tiền thành công!', 'success');
    }
}

// ================= PHÍM TẮT TỔNG HỢP =================
document.addEventListener('keydown', function (e) {
    const keyLower = e.key.toLowerCase();

    // 1. Enter trong các Modal
    if (e.key === 'Enter') {
        const overlay = document.getElementById('custom-modal-overlay');
        if (overlay && overlay.style.display !== 'none') {
            const promptInput = document.getElementById('modal-prompt-input');
            const inputContainer = document.getElementById('modal-input-container');
            if (inputContainer && inputContainer.style.display !== 'none' && promptInput) {
                e.preventDefault();
                const btnOk = overlay.querySelector('.btn-green');
                if (btnOk) btnOk.click();
                return;
            }
        }
        const manualModal = document.getElementById('manual-input-modal');
        if (manualModal && manualModal.style.display !== 'none') {
            e.preventDefault();
            if (typeof confirmManualInput === 'function') confirmManualInput();
            return;
        }
        const smartModal = document.getElementById('smart-manual-modal');
        if (smartModal && smartModal.style.display !== 'none') {
            e.preventDefault();
            if (typeof confirmSmartManual === 'function') confirmSmartManual();
            return;
        }
    }

    // 2. Phím tắt màn hình khóa (Chỉ chạy khi !isUnlocked)
    if (typeof isUnlocked !== 'undefined' && !isUnlocked) {
        // Ctrl + M → Mở màn hình khóa
        if (e.ctrlKey && keyLower === 'm') {
            e.preventDefault();
            if (typeof revealLockScreen === 'function') revealLockScreen();
            return;
        }
        // Ctrl + Shift + R hoặc Ctrl + Alt + R → Reset an toàn
        if (e.ctrlKey && (e.shiftKey || e.altKey) && keyLower === 'r') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof triggerSecureResetPattern === 'function') triggerSecureResetPattern();
            return;
        }
        // Ctrl + Shift + Q → Đặt lại MÃ ADMIN về mặc định gốc. Khác hẳn
        // Ctrl+Shift+R ở trên (mở bảng chức năng admin, vẫn cần NHẬP ĐÚNG mã
        // Admin hiện tại) — phím tắt này dành riêng cho tình huống chính admin
        // QUÊN mã Admin vừa tự đổi, nên KHÔNG thể đòi hỏi nhập lại mã cũ (đó
        // là thứ đang bị quên). Có hỏi xác nhận trước khi thực sự đặt lại để
        // tránh bấm nhầm ngoài ý muốn.
        if (e.ctrlKey && e.shiftKey && keyLower === 'q') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof triggerResetAdminCodeToDefault === 'function') triggerResetAdminCodeToDefault();
            return;
        }
        return; // Đang khóa -> Chặn toàn bộ phím tắt ứng dụng phía dưới
    }

    // 3. Phím tắt chức năng (Chỉ chạy khi đã MỞ KHÓA)
    if (e.shiftKey && keyLower === 't') {
        e.preventDefault();
        if (typeof openSmartManualModal === 'function') openSmartManualModal();
        else if (typeof openManualModal === 'function') openManualModal();
        return;
    }

    // Ctrl + D → Focus ô KQXS
    if (e.shiftKey && keyLower === 'd') {
        e.preventDefault();
        const kq = document.getElementById('kqxs-input');
        if (kq) { kq.focus(); kq.select(); }
        return;
    }

    // Ctrl + S → Dò số
    if (e.shiftKey && keyLower === 's') {
        e.preventDefault();
        if (typeof checkAllResults === 'function') checkAllResults();
        return;
    }
	// Shift + F → Mở Lọc & Tách Số
if (e.shiftKey && keyLower === 'f') {
    e.preventDefault();
    if (typeof openSmartFilterFromInput === 'function') {
        openSmartFilterFromInput();
    }
    return;
}
if (e.shiftKey && keyLower === 'g') {
    e.preventDefault();
    if (typeof addSmartRow === 'function') {
        addSmartRow();
    }
    return;
}
if (e.shiftKey && keyLower === 'b') {
    e.preventDefault();
    if (typeof processSmartInput === 'function') {
        processSmartInput();
    }
    return;
}
});

// ================= KHỞI TẠO ỨNG DỤNG =================
window.addEventListener('DOMContentLoaded', async () => {
    const lockScreen = document.getElementById('lock-screen');
    const mainApp = document.getElementById('main-app');
    if (lockScreen) lockScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'none';

    const ocean = document.getElementById('ocean');
    if (ocean) {
        ocean.style.display = 'block';
        ocean.style.visibility = 'visible';
        ocean.style.opacity = '1';
        ocean.style.zIndex = '1';
    }
    // Load tỷ lệ đã lưu
    if (typeof loadCustomRates === 'function') loadCustomRates();
    if (typeof applyCustomRatesToUI === 'function') applyCustomRatesToUI();
    if (typeof initOcean === 'function') initOcean();

    try {
        if (typeof initIndexedDB === 'function') await initIndexedDB();
        if (typeof loadAppDataFromDB === 'function') await loadAppDataFromDB();
        if (typeof groups !== 'undefined' && Array.isArray(groups)) {
            groups.forEach(g => {
                if (typeof initAppDataForGroup === 'function') initAppDataForGroup(g);
            });
        }
    } catch (err) {
        console.error("Lỗi khởi tạo dữ liệu IndexedDB:", err);
        if (typeof groups !== 'undefined' && Array.isArray(groups)) {
            groups.forEach(g => {
                if (typeof initAppDataForGroup === 'function') initAppDataForGroup(g);
            });
        }
    }

    if (typeof STORAGE_KEY_USER !== 'undefined') {
        const savedUser = localStorage.getItem(STORAGE_KEY_USER);
        if (savedUser) {
            if (typeof currentUser !== 'undefined') currentUser = savedUser;
            const nameInput = document.getElementById('user-name-input');
            if (nameInput) nameInput.value = savedUser;
        }
    }
});

// ================= BỘ CÔNG CỤ TỐI ƯU NHẬP NHANH & LỌC / CẮT THÔNG MINH =================
// - Nhận "dac biet / đặc biệt / đb" → db (cần kèm sửa mapBetType + typeRe ở trên)
// - Lọc theo loại, cắt K cố định, cắt tỷ lệ 3/7 (lưu localStorage)
// - Mở modal KHI CHƯA CÓ dữ liệu: tự nhập số + loại + tiền rồi cắt
// - Preset tỷ lệ nhanh 3/7, 1/1, 2/8, 4/6…
const SMART_FILTER_RATIO_KEY = 'SEA_LOTTO_SMART_FILTER_RATIO';

// Ghi rõ nhãn cho 4 loại dễ nhầm: "2c/3c" = Bao Lô (bao hết giải), "c2/c3" = 2C/3C riêng (chỉ 1 giải)
const FILTER_CHIP_LABEL_OVERRIDE = {
    '2c': 'Bao Lô 2C (bao hết)',
    '3c': 'Bao Lô 3C (bao hết)',
    'c2': '2C riêng (Giải 8)',
    'c3': '3C riêng (Giải 7)'
};

let smartFilterState = {
    targetK: 0,
    filterTypes: [],
    isInverted: false,
    ratioA: 0,
    ratioB: 0
};

function getItemK(item) {
    if (item.originalAmount !== undefined && item.originalAmount !== null) {
        return Number(item.originalAmount) || 0;
    }
    if (item.amount) {
        return item.amount >= 1000 ? item.amount / 1000 : Number(item.amount) || 0;
    }
    return 0;
}

function normalizeBetTypeKey(raw) {
    if (!raw) return '';
    const t = String(raw).toLowerCase().trim();
    if (typeof mapBetType === 'function') {
        try { return mapBetType(t) || t; } catch (_) { /* ignore */ }
    }
    // fallback khi mapBetType chưa nhận "dac biet"
    const compact = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');
    if (/^(db|de|debiet|dacbiet|dacbit|gdb)$/.test(compact)) return 'db';
    return t;
}

function parseRatioInput(str) {
    if (!str) return null;
    const m = String(str).trim().replace(/\s+/g, '').match(/^(\d+(?:[.,]\d+)?)[/:](\d+(?:[.,]\d+)?)$/);
    if (!m) return null;
    const a = parseFloat(m[1].replace(',', '.'));
    const b = parseFloat(m[2].replace(',', '.'));
    if (!(a > 0) || !(b > 0)) return null;
    return { a, b };
}

function loadSavedRatio() {
    try {
        const raw = localStorage.getItem(SMART_FILTER_RATIO_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (p && p.a > 0 && p.b > 0) return p;
    } catch (_) { /* ignore */ }
    return null;
}

function saveRatio(a, b) {
    try {
        localStorage.setItem(SMART_FILTER_RATIO_KEY, JSON.stringify({ a, b }));
    } catch (_) { /* ignore */ }
}

function batchCutAmount(items, cutK, onlyTypes = []) {
    if (!cutK || cutK <= 0) return items;
    const typeKeys = (Array.isArray(onlyTypes) ? onlyTypes : (onlyTypes ? [onlyTypes] : [])).map(normalizeBetTypeKey);
    const result = [];
    let cutCount = 0;

    items.forEach(item => {
        const itemType = normalizeBetTypeKey(item.betType);
        const shouldCut = !typeKeys.length || typeKeys.includes(itemType);
        const currentK = getItemK(item);

        if (shouldCut && currentK > cutK) {
            const remainK = +(currentK - cutK).toFixed(2);
            const kept = {
                ...JSON.parse(JSON.stringify(item)),
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                originalAmount: remainK,
                amount: remainK * 1000,
                note: (item.note || '') + ` [Giữ ${remainK}k]`,
                _part: 'kept'
            };
            const cut = {
                ...JSON.parse(JSON.stringify(item)),
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                originalAmount: cutK,
                amount: cutK * 1000,
                note: `[Cắt ${cutK}k từ ${currentK}k]`,
                _part: 'cut'
            };
            result.push(kept, cut);
            cutCount++;
        } else {
            result.push({ ...JSON.parse(JSON.stringify(item)), _part: 'kept' });
        }
    });

    if (cutCount > 0 && typeof showToast === 'function') {
        const scope = typeKeys.length ? ` (chỉ ${typeKeys.map(t => FILTER_CHIP_LABEL_OVERRIDE[t] || (BET_TYPES && BET_TYPES[t]?.name) || t).join(', ')})` : '';
        showToast(`Đã cắt ${cutK}k${scope} → ${cutCount * 2} mục`, 'success');
    }
    return result;
}

function batchCutByRatio(items, ratioA, ratioB, onlyTypes = []) {
    if (!(ratioA > 0) || !(ratioB > 0)) return items;
    const typeKeys = (Array.isArray(onlyTypes) ? onlyTypes : (onlyTypes ? [onlyTypes] : [])).map(normalizeBetTypeKey);
    const totalParts = ratioA + ratioB;
    const result = [];
    let cutCount = 0;

    items.forEach(item => {
        const itemType = normalizeBetTypeKey(item.betType);
        const shouldCut = !typeKeys.length || typeKeys.includes(itemType);
        const currentK = getItemK(item);

        if (shouldCut && currentK > 0) {
            const keepK = +((currentK * ratioA) / totalParts).toFixed(2);
            const adjustedCut = +(currentK - keepK).toFixed(2);
            if (keepK <= 0 || adjustedCut <= 0) {
                result.push({ ...JSON.parse(JSON.stringify(item)), _part: 'kept' });
                return;
            }
            result.push({
                ...JSON.parse(JSON.stringify(item)),
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                originalAmount: keepK,
                amount: keepK * 1000,
                note: (item.note || '') + ` [Giữ ${keepK}k = ${ratioA}/${totalParts}]`,
                _part: 'kept'
            });
            result.push({
                ...JSON.parse(JSON.stringify(item)),
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                originalAmount: adjustedCut,
                amount: adjustedCut * 1000,
                note: `[Cắt ${adjustedCut}k = ${ratioB}/${totalParts} từ ${currentK}k]`,
                _part: 'cut'
            });
            cutCount++;
        } else {
            result.push({ ...JSON.parse(JSON.stringify(item)), _part: 'kept' });
        }
    });

    if (cutCount > 0 && typeof showToast === 'function') {
        const scope = typeKeys.length ? ` (chỉ ${typeKeys.map(t => FILTER_CHIP_LABEL_OVERRIDE[t] || (BET_TYPES && BET_TYPES[t]?.name) || t).join(', ')})` : '';
        showToast(`Cắt tỷ lệ ${ratioA}/${ratioB}${scope} → ${cutCount} số`, 'success');
    }
    return result;
}

function getSplitItems(items) {
    if (!items || !Array.isArray(items)) return { selected: [], unselected: [] };
    const k = smartFilterState.targetK;
    const typeKeys = (smartFilterState.filterTypes || []).map(normalizeBetTypeKey);
    const inv = smartFilterState.isInverted;
    const hasCut = items.some(it => it._part === 'kept' || it._part === 'cut');

    let selected = [], unselected = [];

    if (hasCut && (!k || k <= 0) && !typeKeys.length) {
        const kept = items.filter(it => it._part !== 'cut');
        const cut = items.filter(it => it._part === 'cut');
        return inv ? { selected: cut, unselected: kept } : { selected: kept, unselected: cut };
    }

    items.forEach(it => {
        const ik = getItemK(it);
        const itType = normalizeBetTypeKey(it.betType);
        let match = true;
        if (hasCut) match = (it._part !== 'cut');
        if (typeKeys.length && !typeKeys.includes(itType)) match = false;
        if (k > 0 && Math.abs(ik - k) >= 0.001) match = false;
        (match ? selected : unselected).push(it);
    });

    return inv ? { selected: unselected, unselected: selected } : { selected, unselected };
}

function exportFilteredToCopyText(items) {
    if (!items || !items.length) return '';
    const grouped = {};
    items.forEach(it => {
        let nums = [];
        if (Array.isArray(it.numbers) && it.numbers.length) nums = it.numbers;
        else if (Array.isArray(it.num) && it.num.length) nums = it.num;
        else {
            const n = it.num || it.number || it.so || '';
            if (n) nums = [n];
        }
        if (!nums.length) return;
        const province = (it.province || it.dai || it.domain || '').toUpperCase();
        const type = (it.betType || 'bl').toLowerCase();
        const amt = getItemK(it);
        const key = `${province}|${type}|${amt}`;
        if (!grouped[key]) grouped[key] = { province, type, amount: amt, numbers: [] };
        nums.forEach(n => {
            const c = String(n).trim();
            if (c) grouped[key].numbers.push(c);
        });
    });
    return Object.values(grouped)
        .filter(g => g.numbers.length)
        .map(g => `${g.province ? g.province + ': ' : ''}${g.numbers.join('.')} ${g.type} ${g.amount}k`)
        .join('\n');
}

function buildFilterRow(it) {
    let numVal = it.num || it.number || it.so || '-';
    if (Array.isArray(it.numbers) && it.numbers.length) numVal = it.numbers.join('.');
    const amtK = getItemK(it);
    const betType = (it.betType || 'bl').toUpperCase();
    const typeLabel = (typeof BET_TYPES !== 'undefined' && BET_TYPES[it.betType]?.name) || betType;
    return `
        <tr style="border-bottom:1px solid #334155;">
            <td style="padding:6px;color:#00f3ff;font-weight:bold;max-width:130px;word-break:break-all;">${numVal}</td>
            <td style="padding:6px;" title="${betType}">${typeLabel}</td>
            <td style="padding:6px;color:#fbbf24;font-weight:bold;">${amtK}k</td>
            <td style="padding:6px;color:#94a3b8;font-size:11px;">${it.note || '-'}</td>
            <td style="padding:6px;">
                <button class="btn btn-gray" style="padding:2px 6px;font-size:11px;"
                        onclick="promptSingleSplit('${it.id}')">✂️</button>
            </td>
        </tr>`;
}

function collectPendingBetTypes(items) {
    const set = new Set();
    (items || []).forEach(it => {
        const t = normalizeBetTypeKey(it.betType);
        if (t) set.add(t);
    });
    // luôn có các loại hay dùng để chọn nhanh dù tin chưa có
    // Không liệt kê "bl" ở đây vì trùng hệt "2c" (Bao Lô 2C) — cùng bảng giải, chọn "2c" là đủ.
    // "2c"/"3c" = Bao Lô (bao hết các giải) khác với "c2"/"c3" = 2C/3C riêng (chỉ Giải 8/Giải 7)
    ['db', '2c', '3c', 'c2', 'c3', 'da', 'dx', 'dd', 'dau', 'duoi', 'xc', 'g1', 'g7', 'g8'].forEach(t => set.add(t));
    return [...set].sort();
}

/** Parse dòng nhập tay trong modal: "39 68 db 300" hoặc "39 dac biet 300k" */
function parseManualFilterLine(raw, region) {
    const line = String(raw || '').trim();
    if (!line) return [];
    if (typeof parseSmartLottoText === 'function') {
        const items = parseSmartLottoText(line, region || 'MT') || [];
        if (items.length) return items;
    }
    // fallback cực đơn giản: số + loại + tiền
    const nums = (line.match(/\b\d{2,4}\b/g) || []);
    const amtM = line.match(/(\d+(?:[.,]\d+)?)\s*(k|n|ng|tr|m)?\s*$/i);
    let amount = 0;
    if (amtM) {
        amount = parseFloat(amtM[1].replace(',', '.')) || 0;
        if (/tr|m/i.test(amtM[2] || '')) amount *= 1000;
    }
    const typeGuess = normalizeBetTypeKey(
        (line.match(/\b(dac\s*biet|dacbiet|db|de|bl|lo|da|dx|xc|g[1-8]|dau|duoi|dd|2c|3c|4c|5c)\b/i) || [])[0] || 'bl'
    );
    if (!nums.length || amount <= 0) return [];
    return nums.map(n => {
        if (typeof createItem === 'function') return createItem(n, amount, region || 'MT', typeGuess, 'MANUAL');
        return {
            id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            num: n, betType: typeGuess, originalAmount: amount, amount: amount * 1000,
            region: region || 'MT', matched: false, winAmount: 0, note: 'MANUAL'
        };
    });
}

function renderSmartFilterModal() {
    // Cho phép mở khi CHƯA có dữ liệu — người dùng tự nhập
    if (!Array.isArray(pendingInputItems)) pendingInputItems = [];

    smartFilterState.targetK = 0;
    smartFilterState.filterTypes = [];
    smartFilterState.isInverted = false;

    const saved = loadSavedRatio();
    if (saved) {
        smartFilterState.ratioA = saved.a;
        smartFilterState.ratioB = saved.b;
    } else {
        smartFilterState.ratioA = 0;
        smartFilterState.ratioB = 0;
    }

    const region = document.querySelector('input[name="region-select"]:checked')?.value || 'MT';
    const ratioPlaceholder = saved ? `${saved.a}/${saved.b}` : '3/7';

    const modalBody = `
        <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input type="text" id="filter-manual-input"
                   placeholder="Nhập tay: 39 dac biet 300k  hoặc  68 79 bl 50"
                   style="flex:1;min-width:220px;padding:6px 8px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:4px;font-size:12px;">
            <button class="btn btn-green" style="padding:4px 10px;font-size:12px;" id="btn-add-manual">➕ Thêm</button>
        </div>

        <div style="margin-bottom:10px;display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:12px;color:#94a3b8;">Loại (bấm để chọn nhiều loại cùng lúc, ví dụ Đặc biệt + Bao Lô):</label>
            <div id="filter-type-chips" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
        </div>

        <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <input type="number" id="filter-amt-input" placeholder="K (vd 100)"
                   style="width:80px;padding:4px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:4px;font-size:12px;">

            <button class="btn btn-green" style="padding:4px 8px;font-size:12px;" id="btn-do-filter">🔍 Lọc</button>
            <button class="btn btn-orange" style="padding:4px 8px;font-size:12px;" id="btn-do-cut">✂️ Cắt K</button>
            <button class="btn btn-blue" style="padding:4px 8px;font-size:12px;" id="btn-do-invert">🔄 Đảo</button>
            <button class="btn btn-gray" style="padding:4px 8px;font-size:12px;" id="btn-reset-filter">Xóa lọc</button>
            <button class="btn btn-gray" style="padding:4px 8px;font-size:12px;background:#7f1d1d;color:#fecaca;" id="btn-clear-all" title="Xóa sạch cả 2 khung, không cần tải lại trang">🗑️ Xóa tất cả</button>
        </div>

        <div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span style="font-size:11px;color:#64748b;">Tỷ lệ cắt:</span>
            <input type="text" id="filter-ratio-input" placeholder="${ratioPlaceholder}" value="${saved ? saved.a + '/' + saved.b : ''}"
                   style="width:70px;padding:4px;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:4px;font-size:12px;"
                   title="Tỷ lệ giữ/cắt. Lưu tự động sau mỗi lần cắt">
            <button class="btn btn-orange" style="padding:4px 8px;font-size:12px;background:#b45309;" id="btn-do-ratio">📐 Cắt tỷ lệ</button>
            <span style="font-size:11px;color:#64748b;margin-left:6px;">Preset:</span>
            ${['3/7', '1/1', '2/8', '4/6', '1/9'].map(r =>
                `<button class="btn btn-gray" style="padding:2px 8px;font-size:11px;" data-ratio="${r}">${r}</button>`
            ).join('')}
        </div>

        <div style="font-size:11px;color:#64748b;margin-bottom:6px;line-height:1.45;">
            • <b style="color:#fbbf24;">39 dac biet 300k</b> → nhận loại Đặc biệt (db).<br>
            • Cắt tỷ lệ <b>3/7</b>: 100k → giữ 30k + cắt 70k. Tỷ lệ được <b>lưu</b> cho lần sau.<br>
            • Chọn nhiều chip Loại cùng lúc để lọc gộp nhiều loại. "🗑️ Xóa tất cả" xóa sạch 2 khung ngay, không cần F5.<br>
            • Mở được khi chưa có tin — gõ tay nhiều số rồi cắt hàng loạt.
        </div>

        <div id="filter-status-tag" style="font-size:11px;color:#00f3ff;margin-bottom:8px;"></div>

        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">
            <div style="flex:1;min-width:260px;">
                <div style="font-size:12px;color:#4ade80;font-weight:bold;margin-bottom:4px;">
                    ✅ ĐƯỢC CHỌN — <span id="count-selected">0</span>
                </div>
                <div style="max-height:300px;overflow-y:auto;border:1px solid #166534;border-radius:6px;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr style="background:#14532d;color:#bbf7d0;">
                            <th style="padding:5px;">Số</th><th style="padding:5px;">Loại</th>
                            <th style="padding:5px;">Tiền</th><th style="padding:5px;">Ghi chú</th><th style="padding:5px;">Tách</th>
                        </tr></thead>
                        <tbody id="table-selected"></tbody>
                    </table>
                </div>
            </div>
            <div style="flex:1;min-width:260px;">
                <div style="font-size:12px;color:#fbbf24;font-weight:bold;margin-bottom:4px;">
                    📋 KHÔNG CHỌN — <span id="count-unselected">0</span>
                </div>
                <div style="max-height:300px;overflow-y:auto;border:1px solid #854d0e;border-radius:6px;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr style="background:#713f12;color:#fef08a;">
                            <th style="padding:5px;">Số</th><th style="padding:5px;">Loại</th>
                            <th style="padding:5px;">Tiền</th><th style="padding:5px;">Ghi chú</th><th style="padding:5px;">Tách</th>
                        </tr></thead>
                        <tbody id="table-unselected"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div style="margin-top:12px;">
            <button class="btn btn-green" style="width:100%;" id="btn-copy-out">📋 Copy bảng KHÔNG CHỌN</button>
        </div>
    `;

    showModal({
        title: "🔍 Lọc / Cắt thông minh",
        body: modalBody,
        confirmText: "Đưa Bảng ĐƯỢC CHỌN vào Chi Tiết",
        cancelText: "Đóng",
        showCancel: true,
        wide: true,
        onConfirm: () => {
            const { selected } = getSplitItems(pendingInputItems);
            if (!selected.length) return showToast("Không có mục nào được chọn!", "error");

            const itemsToInsert = selected.map(it => {
                const amtK = getItemK(it);
                const clone = {
                    ...it,
                    id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    originalAmount: amtK,
                    amount: amtK * 1000
                };
                delete clone._part;
                return clone;
            });

            const g = typeof activeGroup !== 'undefined' ? activeGroup : 'A';
            if (!appData[g]) appData[g] = {};
            if (!appData[g].inputHistory) appData[g].inputHistory = [];
            if (!appData[g].betList) appData[g].betList = [];

            appData[g].inputHistory.push({
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date().toLocaleDateString('vi-VN'),
                items: itemsToInsert
            });
            appData[g].betList.push(...itemsToInsert);

            if (typeof renderMatrixTable === 'function') renderMatrixTable();
            if (typeof updateGrandSummary === 'function') updateGrandSummary();
            if (typeof saveAppDataToDBDebounced === 'function') saveAppDataToDBDebounced();

            showToast(`Đã đưa ${itemsToInsert.length} mục vào Chi Tiết`, "success");
            pendingInputItems = [];
            const ta = document.getElementById('smart-input') || document.querySelector('textarea');
            if (ta) ta.value = '';
        }
    });

    const renderTypeChips = () => {
        const wrap = document.getElementById('filter-type-chips');
        if (!wrap) return;
        const allTypes = collectPendingBetTypes(pendingInputItems);
        const active = smartFilterState.filterTypes;
        const chipStyle = (isOn) => `display:inline-flex;align-items:center;padding:3px 9px;border-radius:12px;font-size:11px;cursor:pointer;user-select:none;border:1px solid ${isOn ? '#06b6d4' : '#334155'};background:${isOn ? 'rgba(6,182,212,0.2)' : '#1e293b'};color:${isOn ? '#67e8f9' : '#94a3b8'};`;

        const chipsHtml = [`<span class="type-chip" data-type="__all__" style="${chipStyle(active.length === 0)}">Tất cả</span>`]
            .concat(allTypes.map(t => {
                const label = FILTER_CHIP_LABEL_OVERRIDE[t] || (typeof BET_TYPES !== 'undefined' && BET_TYPES[t]?.name) || t.toUpperCase();
                return `<span class="type-chip" data-type="${t}" style="${chipStyle(active.includes(t))}">${label}</span>`;
            }))
            .join('');
        wrap.innerHTML = chipsHtml;

        wrap.querySelectorAll('.type-chip').forEach(chip => {
            chip.onclick = () => {
                const t = chip.getAttribute('data-type');
                if (t === '__all__') {
                    smartFilterState.filterTypes = [];
                } else {
                    const idx = smartFilterState.filterTypes.indexOf(t);
                    if (idx === -1) smartFilterState.filterTypes.push(t);
                    else smartFilterState.filterTypes.splice(idx, 1);
                }
                smartFilterState.isInverted = false;
                renderTypeChips();
                updateModalUI();
            };
        });
    };

    const updateModalUI = () => {
        const { selected, unselected } = getSplitItems(pendingInputItems);
        const cs = document.getElementById('count-selected');
        const cu = document.getElementById('count-unselected');
        if (cs) cs.textContent = selected.length;
        if (cu) cu.textContent = unselected.length;

        const status = document.getElementById('filter-status-tag');
        if (status) {
            const inv = smartFilterState.isInverted;
            const typeLabel = smartFilterState.filterTypes.length
                ? smartFilterState.filterTypes.map(t => FILTER_CHIP_LABEL_OVERRIDE[t] || (BET_TYPES && BET_TYPES[t]?.name) || t).join(', ')
                : 'Tất cả';
            const kLabel = smartFilterState.targetK > 0 ? ` | K=${smartFilterState.targetK}` : '';
            const ratioLabel = (smartFilterState.ratioA > 0 && smartFilterState.ratioB > 0)
                ? ` | Tỷ lệ ${smartFilterState.ratioA}/${smartFilterState.ratioB}` : '';
            status.innerHTML = (inv ? '🔄 ĐẢO' : 'Bình thường')
                + ` | Loại: <b>${typeLabel}</b>${kLabel}${ratioLabel}`
                + ` | Chọn: <b>${selected.length}</b> | Không: <b>${unselected.length}</b>`
                + ` | Tổng dòng: <b>${pendingInputItems.length}</b>`;
        }

        const ts = document.getElementById('table-selected');
        const tu = document.getElementById('table-unselected');
        if (ts) ts.innerHTML = selected.length
            ? selected.map(buildFilterRow).join('')
            : '<tr><td colspan="5" style="text-align:center;padding:10px;color:#94a3b8;">Trống — gõ số ở trên rồi Thêm</td></tr>';
        if (tu) tu.innerHTML = unselected.length
            ? unselected.map(buildFilterRow).join('')
            : '<tr><td colspan="5" style="text-align:center;padding:10px;color:#94a3b8;">Trống</td></tr>';
    };

    // Thêm tay
    document.getElementById('btn-add-manual').onclick = () => {
        const inp = document.getElementById('filter-manual-input');
        const raw = inp?.value?.trim() || '';
        if (!raw) return showToast('Nhập số trước!', 'error');
        const added = parseManualFilterLine(raw, region);
        if (!added.length) return showToast('Không nhận được số. VD: 39 dac biet 300k', 'error');
        pendingInputItems.push(...added);
        if (inp) inp.value = '';
        renderTypeChips();
        updateModalUI();
        showToast(`Đã thêm ${added.length} dòng (${added[0].betType})`, 'success');
    };

    document.getElementById('filter-manual-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-add-manual').click();
        }
    });

    // Preset tỷ lệ
    document.querySelectorAll('[data-ratio]').forEach(btn => {
        btn.onclick = () => {
            const r = btn.getAttribute('data-ratio');
            const ratioInp = document.getElementById('filter-ratio-input');
            if (ratioInp) ratioInp.value = r;
            const parsed = parseRatioInput(r);
            if (parsed) {
                smartFilterState.ratioA = parsed.a;
                smartFilterState.ratioB = parsed.b;
                saveRatio(parsed.a, parsed.b);
            }
        };
    });

    document.getElementById('btn-do-filter').onclick = () => {
        const val = parseFloat(document.getElementById('filter-amt-input').value);
        smartFilterState.targetK = isNaN(val) ? 0 : val;
        smartFilterState.isInverted = false;
        updateModalUI();
    };

    document.getElementById('btn-do-cut').onclick = () => {
        if (!pendingInputItems.length) return showToast('Chưa có số để cắt!', 'error');
        const val = parseFloat(document.getElementById('filter-amt-input').value);
        if (isNaN(val) || val <= 0) return showToast('Nhập số K cần cắt!', 'error');
        pendingInputItems = batchCutAmount(pendingInputItems, val, smartFilterState.filterTypes);
        smartFilterState.targetK = 0;
        smartFilterState.isInverted = false;
        updateModalUI();
    };

    document.getElementById('btn-do-ratio').onclick = () => {
        if (!pendingInputItems.length) return showToast('Chưa có số để cắt!', 'error');
        let ratioStr = document.getElementById('filter-ratio-input')?.value || '';
        if (!ratioStr && smartFilterState.ratioA > 0) {
            ratioStr = `${smartFilterState.ratioA}/${smartFilterState.ratioB}`;
        }
        const parsed = parseRatioInput(ratioStr);
        if (!parsed) return showToast('Nhập tỷ lệ dạng 3/7 hoặc bấm preset!', 'error');
        smartFilterState.ratioA = parsed.a;
        smartFilterState.ratioB = parsed.b;
        saveRatio(parsed.a, parsed.b);
        pendingInputItems = batchCutByRatio(pendingInputItems, parsed.a, parsed.b, smartFilterState.filterTypes);
        smartFilterState.targetK = 0;
        smartFilterState.isInverted = false;
        updateModalUI();
    };

    document.getElementById('btn-do-invert').onclick = () => {
        smartFilterState.isInverted = !smartFilterState.isInverted;
        updateModalUI();
    };

    document.getElementById('btn-reset-filter').onclick = () => {
        smartFilterState.targetK = 0;
        smartFilterState.filterTypes = [];
        smartFilterState.isInverted = false;
        // giữ ratio đã lưu
        const amt = document.getElementById('filter-amt-input');
        if (amt) amt.value = '';
        pendingInputItems.forEach(it => { delete it._part; });
        renderTypeChips();
        updateModalUI();
        showToast('Đã xóa lọc (giữ tỷ lệ đã lưu).', 'info');
    };

    document.getElementById('btn-clear-all').onclick = () => {
        if (!pendingInputItems.length) return showToast('Danh sách đang trống!', 'info');
        if (!confirm('Xóa sạch toàn bộ số đang lọc (cả 2 khung)? Không thể hoàn tác.')) return;
        pendingInputItems = [];
        smartFilterState.targetK = 0;
        smartFilterState.filterTypes = [];
        smartFilterState.isInverted = false;
        const amt = document.getElementById('filter-amt-input');
        const manualInp = document.getElementById('filter-manual-input');
        if (amt) amt.value = '';
        if (manualInp) manualInp.value = '';
        renderTypeChips();
        updateModalUI();
        showToast('Đã xóa sạch — không cần tải lại trang.', 'success');
    };

    document.getElementById('btn-copy-out').onclick = () => {
        const { unselected } = getSplitItems(pendingInputItems);
        const text = exportFilteredToCopyText(unselected);
        if (!text) return showToast('Không có dữ liệu copy!', 'error');
        executeCopyText(text);
    };

    window.promptSingleSplit = (id) => {
        const defaultVal = (smartFilterState.ratioA > 0)
            ? `${smartFilterState.ratioA}/${smartFilterState.ratioB}`
            : '10';
        customPrompt('✂️ Tách lẻ', 'Nhập K cố định hoặc tỷ lệ a/b (vd 3/7):', defaultVal, (val) => {
            if (!val) return;
            const idx = pendingInputItems.findIndex(it => it.id === id);
            if (idx === -1) return;
            const item = pendingInputItems[idx];
            const curK = getItemK(item);
            const ratio = parseRatioInput(val);
            let keepK, cutK;
            if (ratio) {
                const total = ratio.a + ratio.b;
                keepK = +((curK * ratio.a) / total).toFixed(2);
                cutK = +(curK - keepK).toFixed(2);
                saveRatio(ratio.a, ratio.b);
            } else {
                cutK = parseFloat(String(val).replace(',', '.'));
                if (isNaN(cutK) || cutK <= 0) return showToast('K không hợp lệ!', 'error');
                if (curK <= cutK) return showToast('K tách phải nhỏ hơn hiện tại!', 'error');
                keepK = +(curK - cutK).toFixed(2);
            }
            if (keepK <= 0 || cutK <= 0) return showToast('Kết quả tách không hợp lệ!', 'error');

            item.originalAmount = keepK;
            item.amount = keepK * 1000;
            item.note = (item.note || '') + ` [Giữ ${keepK}k]`;
            item._part = 'kept';

            pendingInputItems.splice(idx + 1, 0, {
                ...JSON.parse(JSON.stringify(item)),
                id: 'bet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                originalAmount: cutK,
                amount: cutK * 1000,
                note: `[Tách ${cutK}k từ ${curK}k]`,
                _part: 'cut'
            });
            updateModalUI();
        });
    };

    renderTypeChips();
    updateModalUI();
}



function executeCopyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => showToast("Đã copy!", "success"))
            .catch(() => fallbackCopyText(text));
    } else {
        fallbackCopyText(text);
    }
}

function fallbackCopyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast("Đã copy!", "success");
    } catch (e) {
        showToast("Không copy được!", "error");
    }
    document.body.removeChild(ta);
}

function openSmartFilterFromInput() {
    const ta = document.getElementById('smart-input')
            || document.getElementById('quick-input-textarea')
            || document.querySelector('textarea');

    const raw = ta ? ta.value.trim() : '';
    const region = (typeof detectRegionFromText === 'function')
        ? detectRegionFromText(raw, document.querySelector('input[name="region-select"]:checked')?.value || 'MT')
        : (document.querySelector('input[name="region-select"]:checked')?.value || 'MT');

    if (raw) {
        const radio = document.querySelector(`input[name="region-select"][value="${region}"]`);
        if (radio) radio.checked = true;
        if (typeof parseSmartLottoText !== 'function') {
            return showToast('Thiếu hàm parseSmartLottoText!', 'error');
        }
        pendingInputItems = parseSmartLottoText(raw, region) || [];
        if (!pendingInputItems.length) {
            showToast('Không bóc được số từ tin — vẫn mở modal để nhập tay.', 'info');
        }
    } else {
        // Không có tin → vẫn mở, để người dùng nhập tay / cắt hàng loạt
        pendingInputItems = Array.isArray(pendingInputItems) ? pendingInputItems : [];
    }

    renderSmartFilterModal();
}
