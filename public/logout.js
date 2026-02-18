function logout() {
  fetch("/logout", { method: "POST" })
    .then(() => {
      window.location.href = "/home.html";
    });
}