// Bật EHO Agent trên máy người dùng qua liên kết ksnb-eho://start (bộ cài Cai-dat-EHO-Agent.bat đăng ký liên kết này).
// Máy chưa cài thì không có gì xảy ra. Lần đầu Chrome có thể hỏi "Mở EHO Agent?" -> tick "Luôn cho phép" là các lần sau tự mở.
// Gọi trong lúc xử lý một cú bấm của người dùng thì Chrome mới cho mở ứng dụng ngoài.
export function launchEhoAgent() {
  try {
    const f = document.createElement("iframe");
    f.style.display = "none";
    f.src = "ksnb-eho://start";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 4000);
  } catch (e) { /* bỏ qua */ }
}
