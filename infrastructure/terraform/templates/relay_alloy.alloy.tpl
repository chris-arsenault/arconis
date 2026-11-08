logging {
  level = "info"
}

// Only service diagnostics leave the instance. Tool arguments, room links and canvas data
// are not logged by the application. Authentication to TrueNAS belongs to the shared gateway.
loki.source.journal "relay" {
  matches        = "_SYSTEMD_UNIT=arconis-relay.service"
  max_age        = "1h"
  forward_to     = [loki.write.ahara.receiver]
  labels = {
    service_name = "arconis-relay",
    job          = "ahara-ec2",
  }
}

loki.write "ahara" {
  endpoint {
    url = "${loki_push_url}"
  }
}
