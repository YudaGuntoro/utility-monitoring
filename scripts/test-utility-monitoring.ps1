param(
    [string]$BaseUrl = 'http://localhost:5241',
    [string]$Username = 'root',
    [string]$Password = 'root_native',
    [int]$MqttPort = 0
)
$ErrorActionPreference = 'Stop'
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$login = Invoke-RestMethod "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ username=$Username; password=$Password } | ConvertTo-Json)
$headers = @{ Authorization = 'Bearer ' + $login.data.access_token }
function Call($method, $path, $body) {
    $options = @{ Uri="$BaseUrl$path"; Method=$method; Headers=$headers; TimeoutSec=45 }
    if ($null -ne $body) { $options.ContentType='application/json'; $options.Body=$body | ConvertTo-Json }
    (Invoke-RestMethod @options).data
}
function Reject($method, $path, $body, $status) {
    try { $null = Call $method $path $body } catch {
        Assert ([int]$_.Exception.Response.StatusCode -eq $status) "Expected HTTP $status for $path, got $_"
        return
    }
    throw "Expected rejection for $path"
}
function Publish($topic, $body) {
    # Minimal MQTT 3.1.1 QoS 0 client, avoiding external test dependencies.
    $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', $MqttPort)
    try {
        $stream = $client.GetStream(); $stream.ReadTimeout=5000
        [byte[]]$connect = 0x10, 0x10, 0, 4, 77, 81, 84, 84, 4, 2, 0, 30, 0, 4, 116, 101, 115, 116
        $stream.Write($connect,0,$connect.Length)
        [byte[]]$ack = New-Object byte[] 4
        $count=0; while ($count -lt 4) { $read=$stream.Read($ack,$count,4-$count); if ($read -eq 0) { throw 'Broker closed connection' }; $count+=$read }
        Assert ($ack[3] -eq 0) 'MQTT broker rejected test connection'
        $topicBytes=[Text.Encoding]::UTF8.GetBytes($topic)
        $payload=[Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
        $remaining=2+$topicBytes.Length+$payload.Length
        $packet=New-Object 'System.Collections.Generic.List[byte]'; $packet.Add(0x30)
        do { $digit=$remaining % 128; $remaining=[math]::Floor($remaining/128); if ($remaining -gt 0) { $digit=$digit -bor 128 }; $packet.Add([byte]$digit) } while ($remaining -gt 0)
        $packet.Add([byte]($topicBytes.Length -shr 8)); $packet.Add([byte]($topicBytes.Length -band 255)); $packet.AddRange($topicBytes); $packet.AddRange($payload)
        $bytes=$packet.ToArray(); $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush()
    } finally { $client.Dispose() }
}
$created = @()
try {
    foreach ($kind in @('water','compressed-air')) {
        $base="/api/utilities/$kind/devices"
        $request=@{ deviceCode=('TEST-' + [guid]::NewGuid().ToString('N').Substring(0,12)); name='Integration test'; location='Test'; enabled=$true; lowPressureBar=4; highFlowRate=20 }
        $meter=Call 'Post' $base $request
        $created += @{ path="$base/$($meter.id)" }
        Assert ($meter.status -eq 'offline' -and $null -eq $meter.latest) 'New meter must have no readings'
        Reject 'Post' $base $request 400
        $stale=@{ timestamp=[DateTimeOffset]::UtcNow.AddMinutes(-10).ToString('o'); flowRate=5; totalVolume=90; pressureBar=2 }
        $null=Call 'Post' "$base/$($meter.id)/telemetry" $stale
        $staleRows=Call 'Get' $base $null; $staleMeter=$staleRows | Where-Object id -eq $meter.id
        Assert ($staleMeter.status -eq 'offline' -and $staleMeter.warnings.Count -eq 0) 'Stale readings must be offline without active alarms'
        $reading=@{ timestamp=[DateTimeOffset]::UtcNow.AddSeconds(-5).ToString('o'); flowRate=25; totalVolume=123; pressureBar=3; temperatureC=28 }
        if ($kind -eq 'compressed-air') { $reading.powerKw=12 }
        $result=Call 'Post' "$base/$($meter.id)/telemetry" $reading
        Assert $result.inserted 'First telemetry must insert'
        $result=Call 'Post' "$base/$($meter.id)/telemetry" $reading
        Assert (-not $result.inserted) 'Duplicate must not insert'
        $older=$reading.Clone(); $older.timestamp=[DateTimeOffset]::UtcNow.AddHours(-1).ToString('o'); $older.totalVolume=100
        $null=Call 'Post' "$base/$($meter.id)/telemetry" $older
        $meters=Call 'Get' $base $null; $stored=$meters | Where-Object id -eq $meter.id
        Assert ($stored.status -eq 'warning' -and $stored.warnings.Count -eq 2) 'Fresh readings must trigger both thresholds'
        Assert ($stored.latest.totalVolume -eq 123) 'Out-of-order telemetry must not replace latest'
        $history=Call 'Get' "$base/$($meter.id)/history" $null
        Assert ($history.readings.Count -eq 3) 'History must contain three unique readings'
        $bad=$reading.Clone(); $bad.flowRate=-1
        Reject 'Post' "$base/$($meter.id)/telemetry" $bad 400
        $bad=$reading.Clone(); $bad.Remove('flowRate')
        Reject 'Post' "$base/$($meter.id)/telemetry" $bad 400
        $bad=$reading.Clone(); $bad.timestamp=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
        Reject 'Post' "$base/$($meter.id)/telemetry" $bad 400
        $otherKind=if ($kind -eq 'water') {'compressed-air'} else {'water'}
        Reject 'Get' "/api/utilities/$otherKind/devices/$($meter.id)/history" $null 404
        if ($MqttPort -gt 0) {
            $mqtt=$reading.Clone(); $mqtt.timestamp=[DateTimeOffset]::UtcNow.ToString('o'); $mqtt.totalVolume=130
            Publish $meter.mqttTopic $mqtt
            $found=$false
            for ($attempt=0; $attempt -lt 20; $attempt++) {
                Start-Sleep -Milliseconds 500
                $rows=Call 'Get' $base $null
                $latest=($rows | Where-Object id -eq $meter.id).latest
                if ($latest.totalVolume -eq 130) { $found=$true; break }
            }
            Assert $found "MQTT ingestion failed for $kind"
        }
        $request.enabled=$false; $null=Call 'Put' "$base/$($meter.id)" $request
        Reject 'Post' "$base/$($meter.id)/telemetry" $reading 400
        Write-Output "PASS: $kind CRUD, history, validation, alarm, duplicate, ordering, isolation, disabled meter$(if ($MqttPort -gt 0) { ', MQTT' })"
    }
} finally {
    foreach ($item in $created) { $null=Call 'Delete' $item.path $null }
}
