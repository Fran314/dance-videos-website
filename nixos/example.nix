{ ... }:
let
  name = "example";
  domain = "example.com";
  hostPort = 3000;
  dataRoot = "/srv/${domain}";

  # Video storage location. Point this at a separate or bigger volume if you
  # don't want it under dataRoot.
  storageRoot = "${dataRoot}/storage";
in
{
  imports = [
    # import any necessary additional module
  ];

  users.groups.${name} = { };
  users.users.${name} = {
    isNormalUser = true;
    group = name;
    linger = true; # make user services start at boot without a login
    autoSubUidGidRange = true; # rootless UID mapping
    home = "/home/${name}";

    # Optional: add your admin SSH public key(s) so `just deploy` can SSH in AS this service user.
    openssh.authorizedKeys.keys = [
      # "ssh-ed25519 AAAA... you@host"
    ];
  };

  # Optional: <admin> operates this service's user passwordless. It's not
  # needed for deploys (which use the key above) but it's useful for manually
  # interacting with the deployed environment
  security.sudo.extraRules = [
    {
      users = [ "<admin>" ];
      runAs = name;
      commands = [
        {
          command = "ALL";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];

  systemd.tmpfiles.rules = [
    "d ${dataRoot}          0750 ${name} ${name} -"
    "d ${dataRoot}/data     0750 ${name} ${name} -"
    "d ${storageRoot}       0750 ${name} ${name} -"
    "d ${dataRoot}/temp     0750 ${name} ${name} -"
    "d ${dataRoot}/logs     0750 ${name} ${name} -"
    "d ${dataRoot}/branding 0750 ${name} ${name} -"
  ];

  services.caddy.virtualHosts.${domain}.extraConfig = ''
    encode zstd gzip
    reverse_proxy 127.0.0.1:${toString hostPort}
  '';

  home-manager.users.${name} = {
    xdg.configFile."containers/systemd/${domain}.container".text = ''
      [Unit]
      Description=${domain} backend (API + frontend)

      [Container]
      Image=localhost/${domain}:latest
      ContainerName=${domain}
      PublishPort=127.0.0.1:${toString hostPort}:3000
      Volume=${dataRoot}/data:/data
      Volume=${storageRoot}:/storage
      Volume=${dataRoot}/temp:/temp
      Volume=${dataRoot}/logs:/logs
      Volume=${dataRoot}/branding:/branding:ro
      StopTimeout=15

      [Service]
      Restart=always
      TimeoutStopSec=20

      [Install]
      WantedBy=default.target
    '';
  };
}
