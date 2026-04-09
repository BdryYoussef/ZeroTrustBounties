(module
  (func $add (export "add") (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add
  )
  (func $safe_div (export "safe_div") (param $a i32) (param $b i32) (result i32)
    local.get $b
    i32.eqz
    if
      unreachable
    end
    local.get $a
    local.get $b
    i32.div_s
  )
)
