__kernel void moving_average(__global int *values,
                    __global float *average,
                    int length,
                    int width)
{
    int i;
    int add_value;

    /* width-1 番目の加算処理 */
    add_value = 0;
    for( i = 0; i < width; i++ ) {
        add_value += values[i];
    }
    average[width-1] = (float)add_value;

    /* width ～ length-1 番目の加算処理 */
    for( i = width; i < length; i++ ) {
        add_value = add_value - values[i-width] + values[i];
        average[i] = (float)(add_value);
    }

    /* 0 ～ width -2 番目はクリア */
    for( i = 0; i < width-1; i++ ) {
        average[i] = 0.0f;
    }

    /* width-1 ～ length-1 番目の平均結果算出 */
    for( i = width-1; i < length; i++ ) {
        average[i] /= (float)width;
    }
}
