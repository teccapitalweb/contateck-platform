# Flujos de proceso principales (CONTATECK)

Diagramas en Mermaid (GitHub, VS Code o https://mermaid.live para exportar imagen).

## 1. De la factura al cobro (facturación, contabilidad y cobranza)

```mermaid
sequenceDiagram
    actor C as Contador
    participant F as Facturacion
    participant P as PAC (Fiscalapi)
    participant K as Contabilidad
    participant B as Cobranza

    C->>F: Timbrar CFDI (cliente, productos, IVA)
    F->>P: Enviar para timbrar
    P-->>F: UUID, sello, XML y PDF
    F-->>C: CFDI vigente guardado
    C->>K: Captura rapida > Venta > Importar desde factura timbrada
    K-->>K: Poliza de causacion (Clientes / Ventas / IVA trasladado)
    C->>B: Me pago un cliente (monto, fecha, cuenta)
    B-->>B: Pago REGISTRADO
    C->>B: Confirmar pago
    B-->>K: Poliza del cobro (Bancos / Clientes)
    Note over K,B: Si la factura no se contabilizo antes,<br/>Clientes queda en negativo y el Dashboard avisa
```

## 2. Venta (pago recibido) con revisión

```mermaid
flowchart LR
    A["Vendedor o contador<br/>registra la venta"] --> B{"Estado"}
    B -- "pendiente" --> C["Contador, admin o director<br/>Tomar para revision"]
    C --> D{"Revision"}
    D -- "Confirmar" --> E["Se genera la poliza<br/>(estado: confirmado)"]
    D -- "Rechazar (con motivo)" --> F["Estado: rechazado"]
    A -. "quien registra no valida<br/>(excepto admin y director)" .- C
```

## 3. Contabilidad electrónica hacia el SAT

```mermaid
flowchart TD
    A["Catalogo de cuentas"] --> B["Hoja para la contadora (CSV)"]
    B --> C["La contadora asigna el Codigo Agrupador<br/>(Anexo 24 de la RMF)"]
    C --> D["Cargar codigos agrupador (CSV)<br/>se valida cada codigo contra el catalogo oficial"]
    D --> E["Cuentas con codigo_agrupador"]
    E --> F["XML del Catalogo (esquema SAT 1.3)"]
    G["Polizas del mes"] --> H["Balanza de comprobacion<br/>(debe cuadrar)"]
    H --> I["XML de la Balanza (esquema SAT 1.3)"]
    F --> J["Envio en el portal del SAT"]
    I --> J
```

## 4. Cierre de periodo y corrección de pólizas

```mermaid
flowchart LR
    A["Periodo abierto"] -->|"error en una poliza"| B{"Anular o corregir"}
    B -->|"Anular"| C["Poliza de reversa +<br/>original marcada anulada"]
    B -->|"Corregir"| D["Reversa + poliza nueva<br/>original marcada corregida"]
    A -->|"Cerrar periodo<br/>(contador, admin, director)"| E["Periodo cerrado"]
    E -->|"ya no se registra ni modifica"| F["Los ajustes se hacen<br/>en un periodo abierto"]
```

## 5. Alta de una persona en la empresa

```mermaid
sequenceDiagram
    actor A as Admin o RH
    participant E as Equipo (Invitaciones)
    participant S as Supabase Auth
    actor N as Persona invitada

    A->>E: Nueva invitacion (correo + rol)
    E-->>E: Invitacion pendiente (token, vence en 7 dias)
    N->>S: Crear cuenta con ese mismo correo
    S-->>N: Sesion iniciada
    N->>E: Aceptar invitacion (onboarding)
    E-->>N: Perfil creado en la empresa con el rol elegido
    Note over A,E: Solo admin y director pueden invitar con rol admin o director
```
