{{- $user := .Get "user" -}}
{{- $name := .Get "name" | default (printf "@%s" $user) -}}
{{- $url := printf "https://x.com/%s/status/%s" $user (.Get "id") -}}
{{- range split (trim .Inner "\n") "\n" }}
> {{ . }}
{{- end }}
>
> — {{ $name }} (@{{ $user }}), [{{ .Get "date" | default "View on X" }}]({{ $url }})
