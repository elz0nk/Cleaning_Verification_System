const socket = io();
let usuarioActual = null;
let conversacionActual = null;

fetch("/me")
  .then(r => {
    if (!r.ok) return location.href = "/Signin/login.html";
    return r.json();
  })
  .then(u => usuarioActual = u.usuario);




socket.off("mensaje");
socket.on("mensaje", m => {
  if (m.de === conversacionActual || m.para === conversacionActual) {
    mostrar(m);
  }
});

socket.off("historial");
socket.on("historial", mensajes => {
  chat.innerHTML = "";
  mensajes.forEach(m => mostrar(m));
});


function abrir() {
  conversacionActual = usuarioDestino.value;
  chat.innerHTML = "";
  socket.emit("abrir_conversacion", conversacionActual);
}

function enviar() {
  if (!conversacionActual) return alert("Open a conversation first");

  socket.emit("mensaje", {
    para: conversacionActual,
    texto: texto.value
  });

  texto.value = "";
}


function mostrar(m) {
  const li = document.createElement("li");
  li.textContent = `${m.de}: ${m.texto}`;
  chat.appendChild(li);
}

socket.on("historial", mensajes => {
  chat.innerHTML = "";
  mensajes.forEach(m => mostrar(m));
});
