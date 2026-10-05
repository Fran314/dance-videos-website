{ ... }:
let
  domain = "example.com";
  port = "3000";
in
{
  services.caddy.virtualHosts.${domain}.extraConfig = ''
    encode zstd gzip
    reverse_proxy 127.0.0.1:${port}
  '';
}
