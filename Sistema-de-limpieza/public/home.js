function irAlChat() {
  fetch("/me")
    .then(res => {
      if (res.ok) {
        window.location.href = "/chat.html";
      } else {
        window.location.href = "/Signin/login.html";
      }
    });
}

async function irAlChat() {
  const res = await fetch("/me");
  window.location.href = res.ok
    ? "/chat.html"
    : "/Signin/login.html";
}