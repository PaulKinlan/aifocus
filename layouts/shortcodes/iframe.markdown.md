{{- $src := .Get 0 -}}
{{- with $src -}}[Embedded page]({{ . }}){{- end -}}
