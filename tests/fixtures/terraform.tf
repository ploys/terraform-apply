provider "random" {
  version = "2.2.1"
}

resource "random_id" "id" {
  byte_length = 8
}

output "output" {
  value = random_id.id.b64_std
}
