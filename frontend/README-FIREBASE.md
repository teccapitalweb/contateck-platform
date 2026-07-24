# CONTATECK · Activar Firebase Auth

Mientras `firebase-config.js` tenga los valores `PEGA-AQUI` / `TU-…`, el sitio corre en **modo demo** (el login navega sin validar, igual que ahora). En cuanto pegues tu config real, el acceso con Firebase se activa solo. No hay que tocar más código.

## Pasos (una sola vez)

1. **Proyecto Firebase**
   Entra a [console.firebase.google.com](https://console.firebase.google.com) y usa un proyecto existente o crea `contateck`.

2. **Registrar app web**
   Engrane ⚙ → *Configuración del proyecto* → *Tus apps* → icono `</>` (Web) → registra la app.
   Copia el objeto `firebaseConfig` y pégalo en **`firebase-config.js`** (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).

3. **Habilitar métodos de acceso**
   *Authentication* → *Sign-in method* → activa:
   - **Correo/contraseña**
   - **Google** (elige correo de soporte del proyecto)

4. **Dominios autorizados** (clave para que jale en GitHub Pages y el popup de Google)
   *Authentication* → *Settings* → *Authorized domains* → agrega:
   - `teccapitalweb.github.io`
   - `localhost` (para pruebas locales)

5. **Crear un usuario de prueba**
   *Authentication* → *Users* → *Add user* (correo + contraseña). Con ese entras al panel.

## Cómo queda funcionando

- **Login real**: correo/contraseña + Google, con mensajes de error en español y persistencia de sesión (el check "Recordarme" decide si la sesión sobrevive al cerrar el navegador).
- **Panel protegido**: si no hay sesión, `dashboard.html` te regresa a `login.html`.
- **Usuario real** en la barra lateral (nombre o correo) y **Cerrar sesión** funcional.

## Siguiente paso (datos reales con Firestore)

Cuando quieras dejar de usar los datos demo de `data.js`, se conecta Firestore leyendo las colecciones reales (empresas, pólizas, CFDI, empleados, declaraciones). Reglas base recomendadas para empezar (solo usuarios autenticados):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> Esas reglas son el mínimo para arrancar. Antes de producir en serio conviene afinarlas por empresa/usuario.
