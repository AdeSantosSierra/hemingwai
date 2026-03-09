# Chatbot Access Control (`user_permissions`)

El acceso al chatbot se controla en MongoDB con la colección:

- `Hemingwai.Base_de_datos_noticias.user_permissions`

## Documento esperado

```json
{
  "userId": "user_3A5Yak5hMjC03bDnQCUpI8bSWCG",
  "canUseChatbot": false,
  "email": "user@example.com",
  "createdAt": "2026-03-09T18:00:00.000Z",
  "updatedAt": "2026-03-09T18:00:00.000Z"
}
```

## Índices

Se crean automáticamente desde backend al primer uso:

- `userId` único (`ux_user_permissions_userId`)
- `updatedAt` descendente (`ix_user_permissions_updatedAt_desc`)

## Conceder acceso manual

Desde la raíz del proyecto:

```bash
python src/user_permissions_admin.py --user-id "user_3A5Yak5hMjC03bDnQCUpI8bSWCG" --grant
```

Consultar estado:

```bash
python src/user_permissions_admin.py --user-id "user_3A5Yak5hMjC03bDnQCUpI8bSWCG" --status
```

Revocar acceso:

```bash
python src/user_permissions_admin.py --user-id "user_3A5Yak5hMjC03bDnQCUpI8bSWCG" --revoke
```

## Alternativa con `mongosh`

```javascript
use Hemingwai
db.getSiblingDB("Base_de_datos_noticias").user_permissions.updateOne(
  { userId: "user_3A5Yak5hMjC03bDnQCUpI8bSWCG" },
  {
    $set: {
      canUseChatbot: true,
      updatedAt: new Date()
    },
    $setOnInsert: {
      userId: "user_3A5Yak5hMjC03bDnQCUpI8bSWCG",
      createdAt: new Date()
    }
  },
  { upsert: true }
)
```
