(module
  (global $balance (mut i32) (i32.const 1000))
  (func $drain (export "drain") (param $amount i32)
    global.get $balance
    local.get $amount
    i32.sub
    global.set $balance
  )
  (func $get_balance (export "get_balance") (result i32)
    global.get $balance
  )
  (func $guard (export "guard") (param $x i32) (result i32)
    local.get $x
    i32.const 0
    i32.lt_s
    if
      unreachable
    end
    local.get $x
  )
)
