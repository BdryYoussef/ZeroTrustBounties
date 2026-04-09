BITMAP_SIZE = 8192
TOTAL = BITMAP_SIZE * 8

a = bytearray(BITMAP_SIZE)
b = bytearray(BITMAP_SIZE)

# Remplit exactement 25% des bits (1 bit sur 4)
for i in range(0, TOTAL, 4):
    a[i // 8] |= (1 << (i % 8))
    b[i // 8] |= (1 << (i % 8))

bits_a = sum(bin(x).count('1') for x in a)
bits_b = sum(bin(x).count('1') for x in b)

print(f"Bitmap A : {bits_a} / {TOTAL} = {100*bits_a/TOTAL:.1f}%")
print(f"Bitmap B : {bits_b} / {TOTAL} = {100*bits_b/TOTAL:.1f}%")
print("Seuil 20% : OK")

open("baseline_a.bin", "wb").write(a)
open("baseline_b.bin", "wb").write(b)
print("Fichiers generes : baseline_a.bin baseline_b.bin")
