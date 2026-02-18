async function registrar(e) {
  e.preventDefault();

  if (su_pass1.value !== su_pass2.value) {
    alert("Passwords do not match");
    return;
  }

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usuario: su_user.value,
      email: su_email.value,
      password: su_pass1.value
    })
  });

  if (res.ok) {
    alert("User created");
    chk.checked = true;
  } else {
    alert("Register error");
  }
}

async function login(e) {
  e.preventDefault();

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: li_email.value,
      password: li_pass.value
    })
  });

  if (res.ok) location.href = "/home-logged.html";
  else alert("Invalid credentials");
}

