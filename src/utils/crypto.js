import sodium from "libsodium-wrappers";

export async function generateKeyPair() {
  await sodium.ready;
  const keypair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: sodium.to_base64(keypair.privateKey)
  };
}

export async function encryptMessage(message, recipientPublicKeyBase64, myPrivateKeyBase64) {
  await sodium.ready;
  if (!recipientPublicKeyBase64 || !myPrivateKeyBase64) {
    throw new Error("Missing keys for encryption");
  }
  const recipientPublicKey = sodium.from_base64(recipientPublicKeyBase64);
  const myPrivateKey = sodium.from_base64(myPrivateKeyBase64);

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(message, nonce, recipientPublicKey, myPrivateKey);

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce)
  };
}

export async function decryptMessage(ciphertextBase64, nonceBase64, senderPublicKeyBase64, myPrivateKeyBase64) {
  await sodium.ready;
  const ciphertext = sodium.from_base64(ciphertextBase64);
  const nonce = sodium.from_base64(nonceBase64);
  const senderPublicKey = sodium.from_base64(senderPublicKeyBase64);
  const myPrivateKey = sodium.from_base64(myPrivateKeyBase64);

  const plaintext = sodium.crypto_box_open_easy(ciphertext, nonce, senderPublicKey, myPrivateKey);
  return sodium.to_string(plaintext);
}
